import { Sandbox } from '@e2b/sdk'
import { config } from '../config.js'
import { getSandboxTrackingCollection, type SandboxTracking } from '../db/mongo.js'
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

// ============================================================
// SANDBOX MANAGER IMPLEMENTATION
// ============================================================

export const createSandboxManager = (): SandboxManager => {
  // Internal map: agentId → SandboxInstance
  const sandboxes = new Map<string, SandboxInstance>()

  // ============================================================
  // MONGODB SYNC HELPER
  // ============================================================

  const syncToMongo = async (
    instance: SandboxInstance,
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
        agentType: (instance as SandboxInstanceInternal).agentType,
        specialization: (instance as SandboxInstanceInternal).specialization,
      },
      lifecycle: {
        createdAt: instance.createdAt,
        pausedAt: updates?.pausedAt ?? null,
        resumedAt: updates?.resumedAt ?? null,
        killedAt: updates?.killedAt ?? null,
        lastHeartbeat: now,
      },
      resources: {
        cpuCount: (instance as SandboxInstanceInternal).cpuCount ?? 2,
        memoryMB: (instance as SandboxInstanceInternal).memoryMB ?? 512,
        timeoutMs: (instance as SandboxInstanceInternal).timeoutMs ?? 600000,
      },
      costs: {
        estimatedCost: 0,
        runtimeSeconds: Math.floor((now.getTime() - instance.createdAt.getTime()) / 1000),
      },
    }

    await collection.updateOne(
      { sandboxId: instance.sandboxId },
      { $set: doc },
      { upsert: true }
    )
  }

  // Internal type with extra metadata
  type SandboxInstanceInternal = SandboxInstance & {
    agentType: 'director' | 'specialist'
    specialization?: 'researcher' | 'writer' | 'analyst' | 'general'
    cpuCount?: number
    memoryMB?: number
    timeoutMs?: number
  }

  // ============================================================
  // CREATE
  // ============================================================

  const create = async (cfg: SandboxConfig): Promise<SandboxInstance> => {
    try {
      const sandbox = await Sandbox.create({
        apiKey: config.E2B_API_KEY,
        timeoutMs: cfg.timeoutMs ?? 10 * 60 * 1000, // Default 10 min
        metadata: {
          agentId: cfg.agentId,
          agentType: cfg.agentType,
          specialization: cfg.specialization ?? 'general',
        },
      })

      const now = new Date()
      const instance: SandboxInstanceInternal = {
        sandboxId: sandbox.sandboxId,
        agentId: cfg.agentId,
        sandbox,
        status: 'active',
        createdAt: now,
        lastHeartbeat: now,
        agentType: cfg.agentType,
        specialization: cfg.specialization,
        cpuCount: cfg.cpuCount,
        memoryMB: cfg.memoryMB,
        timeoutMs: cfg.timeoutMs,
      }

      sandboxes.set(cfg.agentId, instance)
      await syncToMongo(instance, { status: 'active' })

      return instance
    } catch (error) {
      throw new SandboxCreationError(
        `Failed to create sandbox for agent ${cfg.agentId}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  // ============================================================
  // EXECUTE
  // ============================================================

  const execute = async (
    agentId: string,
    command: string,
    options?: CommandOptions
  ): Promise<CommandResult> => {
    const instance = sandboxes.get(agentId)
    if (!instance) {
      throw new SandboxNotFoundError(agentId)
    }

    let stdout = ''
    let stderr = ''

    try {
      const result = await instance.sandbox.commands.run(command, {
        cwd: options?.cwd,
        envs: options?.env,
        timeoutMs: options?.timeoutMs,
        onStdout: (data: string) => {
          stdout += data
          options?.onStdout?.(data)
        },
        onStderr: (data: string) => {
          stderr += data
          options?.onStderr?.(data)
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
  // PAUSE
  // ============================================================

  const pause = async (agentId: string): Promise<void> => {
    const instance = sandboxes.get(agentId)
    if (!instance) {
      throw new SandboxNotFoundError(agentId)
    }

    await instance.sandbox.betaPause()
    instance.status = 'paused'
    await syncToMongo(instance, { status: 'paused', pausedAt: new Date() })
  }

  // ============================================================
  // RESUME
  // ============================================================

  const resume = async (agentId: string): Promise<void> => {
    const instance = sandboxes.get(agentId)
    if (!instance) {
      throw new SandboxNotFoundError(agentId)
    }

    // Reconnect to the sandbox
    const sandbox = await Sandbox.connect(instance.sandboxId, {
      apiKey: config.E2B_API_KEY,
    })

    instance.sandbox = sandbox
    instance.status = 'active'
    instance.lastHeartbeat = new Date()
    await syncToMongo(instance, { status: 'active', resumedAt: new Date() })
  }

  // ============================================================
  // KILL
  // ============================================================

  const kill = async (agentId: string): Promise<void> => {
    const instance = sandboxes.get(agentId)
    if (!instance) {
      // No-op for non-existent sandbox (as per contract)
      return
    }

    try {
      await instance.sandbox.kill()
    } catch {
      // Ignore errors during kill - sandbox might already be dead
    }

    instance.status = 'killed'
    await syncToMongo(instance, { status: 'killed', killedAt: new Date() })
    sandboxes.delete(agentId)
  }

  // ============================================================
  // QUERIES
  // ============================================================

  const get = (agentId: string): SandboxInstance | undefined => {
    return sandboxes.get(agentId)
  }

  const list = (): SandboxInstance[] => {
    return Array.from(sandboxes.values())
  }

  const isRunning = (agentId: string): boolean => {
    const instance = sandboxes.get(agentId)
    return instance !== undefined && instance.status !== 'killed'
  }

  // ============================================================
  // RETURN MANAGER
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
  }
}
