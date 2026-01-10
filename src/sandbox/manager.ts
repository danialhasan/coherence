import { Sandbox } from '@e2b/sdk'
import { config } from '../config.js'
import { getSandboxTrackingCollection, getAgentsCollection, type SandboxTracking } from '../db/mongo.js'
import type {
  SandboxConfig,
  SandboxInstance,
  SandboxManager,
  CommandOptions,
  CommandResult,
} from '../contracts/sandbox-manager.contract.js'
import {
  SandboxNotFoundError,
  SandboxCreationError,
  CommandExecutionError,
  CommandTimeoutError,
} from '../contracts/sandbox-manager.contract.js'
import {
  createSandboxRunner,
  type SandboxRunner,
  type OutputCallback,
  type AgentProcess,
} from './runner.js'
import { buildAgentCommand, type AgentRunConfig } from './agent-bundle.js'

// ============================================================
// SANDBOX MANAGER — SINGLE SANDBOX, MULTIPLE AGENTS
// ============================================================
//
// Architecture:
// ┌─────────────────────────────────────────────────────────────────┐
// │                       E2B SANDBOX (SINGLE)                       │
// │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
// │  │ Director        │  │ Specialist      │  │ Specialist      │  │
// │  │ (process 1)     │  │ (process 2)     │  │ (process 3)     │  │
// │  │ Claude SDK      │  │ Claude SDK      │  │ Claude SDK      │  │
// │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
// │                                                                  │
// │  stdout/stderr ────────────────────────────────────────────────▶│ WebSocket
// └─────────────────────────────────────────────────────────────────┘
//
// Key differences from old architecture:
// - ONE sandbox shared by ALL agents (not one sandbox per agent)
// - Each agent is a PROCESS inside the sandbox
// - Kill agent = kill process (sandbox stays alive)
// - Kill sandbox = kill ALL agents
// - Claude SDK runs INSIDE sandbox (not main process)
//

// ============================================================
// EXTENDED TYPES
// ============================================================

export type ExtendedSandboxInstance = SandboxInstance & {
  agentType: 'director' | 'specialist'
  specialization?: 'researcher' | 'writer' | 'analyst' | 'general'
  cpuCount?: number
  memoryMB?: number
  timeoutMs?: number
  processStatus: 'pending' | 'running' | 'completed' | 'error' | 'killed'
}

export type OutputHandler = (
  agentId: string,
  stream: 'stdout' | 'stderr',
  data: string
) => void

// ============================================================
// SANDBOX MANAGER IMPLEMENTATION
// ============================================================

export const createSandboxManager = (outputHandler?: OutputHandler): SandboxManager => {
  // Internal map: agentId → agent metadata (not actual sandbox)
  const agentMetadata = new Map<string, ExtendedSandboxInstance>()

  // Single shared sandbox runner
  let runner: SandboxRunner | null = null

  // Output callback that forwards to handler
  const onOutput: OutputCallback = (agentId, stream, data) => {
    outputHandler?.(agentId, stream, data)
  }

  // ============================================================
  // SANDBOX RUNNER MANAGEMENT
  // ============================================================

  const ensureRunner = async (): Promise<SandboxRunner> => {
    if (!runner) {
      console.log('[SandboxManager] Creating sandbox runner...')

      const sandboxFactory = async () => {
        return Sandbox.create({
          apiKey: config.E2B_API_KEY,
          timeoutMs: 10 * 60 * 1000, // 10 minutes
        })
      }

      const reconnectFactory = async (sandboxId: string) => {
        return Sandbox.connect(sandboxId, {
          apiKey: config.E2B_API_KEY,
        })
      }

      runner = createSandboxRunner(sandboxFactory, reconnectFactory)
    }
    return runner
  }

  // ============================================================
  // MONGODB SYNC HELPER
  // ============================================================

  const syncToMongo = async (
    instance: ExtendedSandboxInstance,
    updates?: Partial<{
      status: SandboxTracking['status']
      pausedAt: Date | null
      resumedAt: Date | null
      killedAt: Date | null
    }>
  ): Promise<void> => {
    const collection = await getSandboxTrackingCollection()

    const now = new Date()
    const doc: SandboxTracking = {
      sandboxId: instance.sandboxId,
      agentId: instance.agentId,
      taskId: null,
      status: updates?.status ?? (instance.status === 'active' ? 'active' : instance.status === 'paused' ? 'paused' : 'killed'),
      metadata: {
        agentType: instance.agentType,
        specialization: instance.specialization,
      },
      lifecycle: {
        createdAt: instance.createdAt,
        pausedAt: updates?.pausedAt ?? null,
        resumedAt: updates?.resumedAt ?? null,
        killedAt: updates?.killedAt ?? null,
        lastHeartbeat: now,
      },
      resources: {
        cpuCount: instance.cpuCount ?? 2,
        memoryMB: instance.memoryMB ?? 512,
        timeoutMs: instance.timeoutMs ?? 600000,
      },
      costs: {
        estimatedCost: 0,
        runtimeSeconds: Math.floor((now.getTime() - instance.createdAt.getTime()) / 1000),
      },
    }

    await collection.updateOne(
      { sandboxId: instance.sandboxId, agentId: instance.agentId },
      { $set: doc },
      { upsert: true }
    )
  }

  // ============================================================
  // CREATE — Register agent for execution in shared sandbox
  // ============================================================

  const create = async (cfg: SandboxConfig): Promise<SandboxInstance> => {
    try {
      // Ensure sandbox runner exists
      const r = await ensureRunner()

      // Get or create the sandbox
      const sandbox = await r.getSandbox()

      // Setup sandbox if not done yet
      if (!r.isReady()) {
        await r.setupSandbox()
      }

      const now = new Date()
      const instance: ExtendedSandboxInstance = {
        sandboxId: sandbox.sandboxId,
        agentId: cfg.agentId,
        sandbox, // Reference to shared sandbox
        status: 'active',
        createdAt: now,
        lastHeartbeat: now,
        agentType: cfg.agentType,
        specialization: cfg.specialization,
        cpuCount: cfg.cpuCount,
        memoryMB: cfg.memoryMB,
        timeoutMs: cfg.timeoutMs,
        processStatus: 'pending',
      }

      agentMetadata.set(cfg.agentId, instance)
      await syncToMongo(instance, { status: 'active' })

      // Update agent document with sandboxId and sandboxStatus
      const agents = await getAgentsCollection()
      await agents.updateOne(
        { agentId: cfg.agentId },
        { $set: { sandboxId: sandbox.sandboxId, sandboxStatus: 'active' } }
      )

      console.log(`[SandboxManager] Agent ${cfg.agentId.slice(0, 8)} registered in sandbox ${sandbox.sandboxId.slice(0, 8)}`)

      return instance
    } catch (error) {
      throw new SandboxCreationError(
        `Failed to create sandbox for agent ${cfg.agentId}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  // ============================================================
  // EXECUTE — Run command in the shared sandbox
  // ============================================================

  const execute = async (
    agentId: string,
    command: string,
    options?: CommandOptions
  ): Promise<CommandResult> => {
    const instance = agentMetadata.get(agentId)
    if (!instance) {
      throw new SandboxNotFoundError(agentId)
    }

    const r = await ensureRunner()
    const sandbox = await r.getSandbox()

    let stdout = ''
    let stderr = ''

    try {
      const result = await sandbox.commands.run(command, {
        cwd: options?.cwd ?? '/home/user/squad-lite',
        envs: {
          ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
          MONGODB_URI: config.MONGODB_URI,
          MONGODB_DB_NAME: config.MONGODB_DB_NAME,
          ...options?.env,
        },
        timeoutMs: options?.timeoutMs ?? 5 * 60 * 1000,
        onStdout: (data: string) => {
          stdout += data
          options?.onStdout?.(data)
          onOutput(agentId, 'stdout', data)
        },
        onStderr: (data: string) => {
          stderr += data
          options?.onStderr?.(data)
          onOutput(agentId, 'stderr', data)
        },
      })

      // Update heartbeat
      instance.lastHeartbeat = new Date()

      return {
        exitCode: result.exitCode,
        stdout,
        stderr,
        error: result.exitCode !== 0,
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new CommandTimeoutError(instance.sandboxId, command)
      }
      throw new CommandExecutionError(
        instance.sandboxId,
        command,
        1,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  // ============================================================
  // RUN AGENT — Execute agent code inside sandbox
  // ============================================================

  /**
   * Run an agent inside the sandbox with Claude SDK
   * This is the core method that launches agent processes
   */
  const runAgent = async (
    agentId: string,
    task: string,
    parentId?: string
  ): Promise<string> => {
    const instance = agentMetadata.get(agentId)
    if (!instance) {
      throw new SandboxNotFoundError(agentId)
    }

    const r = await ensureRunner()

    // Mark as running
    instance.processStatus = 'running'
    instance.lastHeartbeat = new Date()

    const runConfig: AgentRunConfig = {
      agentId,
      agentType: instance.agentType,
      specialization: instance.specialization,
      task,
      parentId,
    }

    try {
      const output = await r.runAgent(runConfig, onOutput)

      instance.processStatus = 'completed'
      instance.lastHeartbeat = new Date()

      return output
    } catch (error) {
      instance.processStatus = 'error'
      instance.lastHeartbeat = new Date()
      throw error
    }
  }

  // ============================================================
  // PAUSE — Pause the entire sandbox
  // ============================================================

  const pause = async (agentId: string): Promise<void> => {
    const instance = agentMetadata.get(agentId)
    if (!instance) {
      throw new SandboxNotFoundError(agentId)
    }

    const r = await ensureRunner()
    await r.pauseSandbox()

    // Mark all agents as paused
    for (const inst of agentMetadata.values()) {
      inst.status = 'paused'
      await syncToMongo(inst, { status: 'paused', pausedAt: new Date() })
    }
  }

  // ============================================================
  // RESUME — Resume the sandbox
  // ============================================================

  const resume = async (agentId: string): Promise<void> => {
    const instance = agentMetadata.get(agentId)
    if (!instance) {
      throw new SandboxNotFoundError(agentId)
    }

    const r = await ensureRunner()
    await r.resumeSandbox()

    // Mark all agents as active
    for (const inst of agentMetadata.values()) {
      inst.status = 'active'
      inst.lastHeartbeat = new Date()
      await syncToMongo(inst, { status: 'active', resumedAt: new Date() })
    }
  }

  // ============================================================
  // KILL — Kill agent process (sandbox stays alive)
  // ============================================================

  const kill = async (agentId: string): Promise<void> => {
    const instance = agentMetadata.get(agentId)
    if (!instance) {
      // No-op for non-existent agent
      return
    }

    // Kill the agent process
    if (runner) {
      await runner.killAgent(agentId)
    }

    // Update state
    instance.status = 'killed'
    instance.processStatus = 'killed'
    await syncToMongo(instance, { status: 'killed', killedAt: new Date() })
    agentMetadata.delete(agentId)

    console.log(`[SandboxManager] Agent ${agentId.slice(0, 8)} killed`)
  }

  // ============================================================
  // KILL SANDBOX — Kill the entire sandbox and all agents
  // ============================================================

  const killSandbox = async (): Promise<void> => {
    if (!runner) {
      return
    }

    // Mark all agents as killed
    for (const [agentId, instance] of agentMetadata) {
      instance.status = 'killed'
      instance.processStatus = 'killed'
      await syncToMongo(instance, { status: 'killed', killedAt: new Date() })
    }

    // Kill the sandbox
    await runner.killSandbox()

    // Clear state
    agentMetadata.clear()
    runner = null

    console.log('[SandboxManager] Sandbox killed, all agents terminated')
  }

  // ============================================================
  // QUERIES
  // ============================================================

  const get = (agentId: string): SandboxInstance | undefined => {
    return agentMetadata.get(agentId)
  }

  const list = (): SandboxInstance[] => {
    return Array.from(agentMetadata.values())
  }

  const isRunning = (agentId: string): boolean => {
    const instance = agentMetadata.get(agentId)
    return instance !== undefined && instance.status !== 'killed'
  }

  /**
   * Get the sandbox ID (same for all agents)
   */
  const getSandboxId = (): string | null => {
    return runner?.getSandboxId() ?? null
  }

  /**
   * Check if sandbox is ready
   */
  const isSandboxReady = (): boolean => {
    return runner?.isReady() ?? false
  }

  // ============================================================
  // RETURN MANAGER (with extended methods)
  // ============================================================

  return {
    create,
    execute,
    pause,
    resume,
    kill,
    get,
    list,
    isRunning,
    // Extended methods (not in contract but available)
    // @ts-expect-error - Extended interface
    runAgent,
    killSandbox,
    getSandboxId,
    isSandboxReady,
  }
}

// ============================================================
// EXTENDED MANAGER TYPE
// ============================================================

export type ExtendedSandboxManager = SandboxManager & {
  /**
   * Run an agent inside the sandbox with Claude SDK
   */
  runAgent(agentId: string, task: string, parentId?: string): Promise<string>

  /**
   * Kill the entire sandbox (all agents)
   */
  killSandbox(): Promise<void>

  /**
   * Get sandbox ID
   */
  getSandboxId(): string | null

  /**
   * Check if sandbox is ready
   */
  isSandboxReady(): boolean
}
