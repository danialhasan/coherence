/**
 * SANDBOX RUNNER — Orchestrates agent execution inside E2B sandbox
 *
 * This module provides the interface between the main Node.js process
 * and the agents running inside the E2B sandbox. It handles:
 *
 * 1. Sandbox lifecycle (create, setup, teardown)
 * 2. Agent process management (spawn, kill, track PIDs)
 * 3. Output streaming (stdout/stderr to WebSocket)
 * 4. Environment setup (pass API keys securely)
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    MAIN NODE PROCESS                             │
 * │  ┌─────────────────────────────────────────────────────────────┐│
 * │  │              SandboxRunner                                   ││
 * │  │  • setupSandbox() - Initialize E2B environment              ││
 * │  │  • runAgent() - Start agent process                         ││
 * │  │  • killAgent() - Stop agent process                         ││
 * │  │  • killSandbox() - Destroy entire sandbox                   ││
 * │  │  • streamOutput() - Forward stdout/stderr                   ││
 * │  └─────────────────────────────────────────────────────────────┘│
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              │ E2B SDK
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                       E2B SANDBOX                                │
 * │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
 * │  │ Agent PID 1 │  │ Agent PID 2 │  │ Agent PID 3 │              │
 * │  │ (Director)  │  │ (Researcher)│  │ (Writer)    │              │
 * │  └─────────────┘  └─────────────┘  └─────────────┘              │
 * │                                                                  │
 * │  /home/user/squad-lite/                                         │
 * │  ├── agent-runner.js                                            │
 * │  ├── package.json                                               │
 * │  └── node_modules/                                              │
 * └─────────────────────────────────────────────────────────────────┘
 */

import { Sandbox } from '@e2b/sdk'
import { config } from '../config.js'
import {
  SANDBOX_FILES,
  buildAgentCommand,
  buildAgentEnvVars,
  type AgentRunConfig,
} from './agent-bundle.js'

// ============================================================
// TYPES
// ============================================================

export type AgentProcess = {
  agentId: string
  pid: number | null  // Process ID inside sandbox (null if process ended)
  status: 'running' | 'completed' | 'error' | 'killed'
  startedAt: Date
  endedAt: Date | null
}

export type SandboxState = {
  sandboxId: string
  sandbox: Sandbox
  isSetup: boolean
  agents: Map<string, AgentProcess>
  createdAt: Date
}

export type OutputCallback = (
  agentId: string,
  stream: 'stdout' | 'stderr',
  data: string
) => void

export type SandboxRunner = {
  /**
   * Get the sandbox (creates one if needed)
   */
  getSandbox(): Promise<Sandbox>

  /**
   * Check if sandbox exists and is ready
   */
  isReady(): boolean

  /**
   * Get sandbox ID
   */
  getSandboxId(): string | null

  /**
   * Set up the sandbox environment (install deps, upload files)
   */
  setupSandbox(): Promise<void>

  /**
   * Run an agent inside the sandbox
   */
  runAgent(
    cfg: AgentRunConfig,
    onOutput?: OutputCallback
  ): Promise<string>

  /**
   * Kill a specific agent process
   */
  killAgent(agentId: string): Promise<void>

  /**
   * Get all running agents
   */
  getAgents(): AgentProcess[]

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentProcess | undefined

  /**
   * Kill the entire sandbox (and all agents)
   */
  killSandbox(): Promise<void>

  /**
   * Pause sandbox (hibernation)
   */
  pauseSandbox(): Promise<void>

  /**
   * Resume sandbox
   */
  resumeSandbox(): Promise<void>
}

// ============================================================
// SANDBOX RUNNER FACTORY
// ============================================================

/**
 * Create a sandbox runner for managing a single E2B sandbox
 * with multiple agent processes
 */
export const createSandboxRunner = (
  sandboxFactory: () => Promise<Sandbox>,
  reconnectFactory: (sandboxId: string) => Promise<Sandbox>
): SandboxRunner => {
  let state: SandboxState | null = null

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  const ensureSandbox = async (): Promise<SandboxState> => {
    if (state && state.sandbox) {
      return state
    }

    console.log('[SandboxRunner] Creating new sandbox...')
    const sandbox = await sandboxFactory()

    state = {
      sandboxId: sandbox.sandboxId,
      sandbox,
      isSetup: false,
      agents: new Map(),
      createdAt: new Date(),
    }

    console.log(`[SandboxRunner] Sandbox created: ${sandbox.sandboxId}`)
    return state
  }

  // ============================================================
  // PUBLIC INTERFACE
  // ============================================================

  const getSandbox = async (): Promise<Sandbox> => {
    const s = await ensureSandbox()
    return s.sandbox
  }

  const isReady = (): boolean => {
    return state !== null && state.isSetup
  }

  const getSandboxId = (): string | null => {
    return state?.sandboxId ?? null
  }

  const setupSandbox = async (): Promise<void> => {
    const s = await ensureSandbox()

    if (s.isSetup) {
      console.log('[SandboxRunner] Sandbox already set up')
      return
    }

    console.log('[SandboxRunner] Setting up sandbox environment...')

    // Upload agent runner files
    for (const [path, content] of Object.entries(SANDBOX_FILES)) {
      console.log(`[SandboxRunner] Writing ${path}`)
      await s.sandbox.files.write(path, content)
    }

    // Install dependencies
    console.log('[SandboxRunner] Installing dependencies...')
    const installResult = await s.sandbox.commands.run(
      'cd /home/user/squad-lite && npm install',
      {
        timeoutMs: 120000, // 2 minutes for npm install
        onStdout: (data) => console.log(`[npm] ${data}`),
        onStderr: (data) => console.error(`[npm] ${data}`),
      }
    )

    if (installResult.exitCode !== 0) {
      throw new Error(`npm install failed with exit code ${installResult.exitCode}`)
    }

    s.isSetup = true
    console.log('[SandboxRunner] Sandbox setup complete')
  }

  const runAgent = async (
    cfg: AgentRunConfig,
    onOutput?: OutputCallback
  ): Promise<string> => {
    const s = await ensureSandbox()

    // Ensure sandbox is set up
    if (!s.isSetup) {
      await setupSandbox()
    }

    // Check if agent already running
    const existing = s.agents.get(cfg.agentId)
    if (existing && existing.status === 'running') {
      throw new Error(`Agent ${cfg.agentId} is already running`)
    }

    console.log(`[SandboxRunner] Starting agent: ${cfg.agentId.slice(0, 8)}`)

    // Create agent process record
    const agentProcess: AgentProcess = {
      agentId: cfg.agentId,
      pid: null, // E2B doesn't easily expose PID
      status: 'running',
      startedAt: new Date(),
      endedAt: null,
    }
    s.agents.set(cfg.agentId, agentProcess)

    // Build command
    const command = buildAgentCommand(cfg)
    console.log(`[SandboxRunner] Command: ${command.slice(0, 100)}...`)

    // Collect output
    let output = ''

    try {
      // Build environment variables including task (prevents command injection)
      const agentEnvVars = buildAgentEnvVars(cfg)

      // Run agent with environment variables
      const result = await s.sandbox.commands.run(command, {
        cwd: '/home/user/squad-lite',
        envs: {
          ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
          MONGODB_URI: config.MONGODB_URI,
          MONGODB_DB_NAME: config.MONGODB_DB_NAME,
          // Pass task via environment variable to prevent command injection
          ...agentEnvVars,
        },
        timeoutMs: 5 * 60 * 1000, // 5 minutes per agent
        onStdout: (data) => {
          output += data
          onOutput?.(cfg.agentId, 'stdout', data)
          // Also log to console for debugging
          console.log(`[${cfg.agentId.slice(0, 8)}] ${data}`)
        },
        onStderr: (data) => {
          onOutput?.(cfg.agentId, 'stderr', data)
          console.error(`[${cfg.agentId.slice(0, 8)}] ERR: ${data}`)
        },
      })

      // Update process state
      agentProcess.status = result.exitCode === 0 ? 'completed' : 'error'
      agentProcess.endedAt = new Date()

      console.log(`[SandboxRunner] Agent ${cfg.agentId.slice(0, 8)} finished with exit code ${result.exitCode}`)

      return output

    } catch (error) {
      agentProcess.status = 'error'
      agentProcess.endedAt = new Date()
      console.error(`[SandboxRunner] Agent ${cfg.agentId.slice(0, 8)} failed:`, error)
      throw error
    }
  }

  const killAgent = async (agentId: string): Promise<void> => {
    if (!state) {
      console.log('[SandboxRunner] No sandbox to kill agent in')
      return
    }

    const agentProcess = state.agents.get(agentId)
    if (!agentProcess) {
      console.log(`[SandboxRunner] Agent ${agentId} not found`)
      return
    }

    // Note: E2B doesn't provide direct process kill API
    // We mark as killed and the process will be orphaned
    // In a production system, you'd use a more sophisticated approach
    agentProcess.status = 'killed'
    agentProcess.endedAt = new Date()

    console.log(`[SandboxRunner] Agent ${agentId.slice(0, 8)} marked as killed`)

    // Try to kill via pkill if we knew the PID pattern
    // For now, we'll use a workaround with pkill by command pattern
    try {
      await state.sandbox.commands.run(
        `pkill -f "agentId.*${agentId}" || true`,
        { timeoutMs: 5000 }
      )
    } catch {
      // Ignore errors - process might already be dead
    }
  }

  const getAgents = (): AgentProcess[] => {
    if (!state) return []
    return Array.from(state.agents.values())
  }

  const getAgent = (agentId: string): AgentProcess | undefined => {
    return state?.agents.get(agentId)
  }

  const killSandbox = async (): Promise<void> => {
    if (!state) {
      console.log('[SandboxRunner] No sandbox to kill')
      return
    }

    console.log(`[SandboxRunner] Killing sandbox: ${state.sandboxId}`)

    // Mark all agents as killed
    for (const agentProcess of state.agents.values()) {
      if (agentProcess.status === 'running') {
        agentProcess.status = 'killed'
        agentProcess.endedAt = new Date()
      }
    }

    // Kill the sandbox
    try {
      await state.sandbox.kill()
    } catch (error) {
      console.error('[SandboxRunner] Error killing sandbox:', error)
    }

    state = null
    console.log('[SandboxRunner] Sandbox killed')
  }

  const pauseSandbox = async (): Promise<void> => {
    if (!state) {
      throw new Error('No sandbox to pause')
    }

    console.log(`[SandboxRunner] Pausing sandbox: ${state.sandboxId}`)

    // E2B beta pause API
    await (state.sandbox as Sandbox & { betaPause: () => Promise<void> }).betaPause()

    console.log('[SandboxRunner] Sandbox paused')
  }

  const resumeSandbox = async (): Promise<void> => {
    if (!state) {
      throw new Error('No sandbox to resume')
    }

    console.log(`[SandboxRunner] Resuming sandbox: ${state.sandboxId}`)

    // Reconnect to the sandbox
    const newSandbox = await reconnectFactory(state.sandboxId)
    state.sandbox = newSandbox

    console.log('[SandboxRunner] Sandbox resumed')
  }

  return {
    getSandbox,
    isReady,
    getSandboxId,
    setupSandbox,
    runAgent,
    killAgent,
    getAgents,
    getAgent,
    killSandbox,
    pauseSandbox,
    resumeSandbox,
  }
}

// ============================================================
// DEFAULT RUNNER FACTORY (uses E2B SDK)
// ============================================================

/**
 * Create a sandbox runner with default E2B configuration
 */
export const createDefaultSandboxRunner = (): SandboxRunner => {
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

  return createSandboxRunner(sandboxFactory, reconnectFactory)
}

// ============================================================
// GLOBAL SINGLETON RUNNER
// ============================================================

let globalRunner: SandboxRunner | null = null

/**
 * Get the global sandbox runner (creates one if needed)
 */
export const getGlobalSandboxRunner = (): SandboxRunner => {
  if (!globalRunner) {
    globalRunner = createDefaultSandboxRunner()
  }
  return globalRunner
}

/**
 * Reset global runner (for testing)
 */
export const resetGlobalSandboxRunner = (): void => {
  globalRunner = null
}
