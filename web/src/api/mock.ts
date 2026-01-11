// ============================================================
// MOCK DATA MODE - Simulates backend for demo testing
// Toggle with ?mock=true query param or VITE_MOCK_MODE=true
// ============================================================

import type {
  AgentResponse,
  WsEvent,
  Specialization,
  MessageType,
  MessageResponse,
} from '@/types'

// ============================================================
// MOCK STATE
// ============================================================

const mockAgents = new Map<string, AgentResponse>()
const mockMessages: MessageResponse[] = []
let eventCallback: ((event: WsEvent) => void) | null = null

// Generate short UUID-like IDs
const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

// ============================================================
// MOCK API RESPONSES
// ============================================================

export const mockApi = {
  agents: {
    list: async (): Promise<{ agents: AgentResponse[] }> => {
      await delay(100)
      return { agents: Array.from(mockAgents.values()) }
    },

    spawn: async (): Promise<AgentResponse> => {
      // Simulate network delay
      await delay(300)

      const agentId = uuid()
      const sandboxId = `sbx_${uuid().slice(0, 8)}`

      const agent: AgentResponse = {
        agentId,
        type: 'director',
        status: 'idle',
        sandboxId,
        sandboxStatus: 'active',
        createdAt: now(),
        lastHeartbeat: now(),
      }

      mockAgents.set(agentId, agent)

      // Emit WebSocket event
      emitEvent({
        type: 'agent:created',
        data: {
          agentId,
          agentType: 'director',
          sandboxId,
        },
      })

      return agent
    },

    submitTask: async (agentId: string, task: string): Promise<{ taskId: string; status: 'assigned' }> => {
      await delay(200)

      const agent = mockAgents.get(agentId)
      if (!agent) throw new Error('Agent not found')

      // Update director to working
      agent.status = 'working'
      mockAgents.set(agentId, agent)

      emitEvent({
        type: 'agent:status',
        data: {
          agentId,
          status: 'working',
          sandboxStatus: 'active',
        },
      })

      // Start the demo flow
      runDemoFlow(agentId, task)

      return { taskId: uuid(), status: 'assigned' }
    },

    getStatus: async (agentId: string): Promise<AgentResponse> => {
      await delay(100)
      const agent = mockAgents.get(agentId)
      if (!agent) throw new Error('Agent not found')
      return agent
    },

    kill: async (agentId: string): Promise<{ agentId: string; status: 'killed'; checkpointId: string }> => {
      await delay(200)

      const agent = mockAgents.get(agentId)
      if (!agent) throw new Error('Agent not found')

      // Create checkpoint before kill
      const checkpointId = uuid()

      emitEvent({
        type: 'checkpoint:new',
        data: {
          checkpointId,
          agentId,
          phase: 'killed',
          timestamp: now(),
        },
      })

      agent.sandboxStatus = 'killed'
      agent.status = 'error'
      mockAgents.set(agentId, agent)

      emitEvent({
        type: 'agent:status',
        data: {
          agentId,
          status: 'error',
          sandboxStatus: 'killed',
        },
      })

      return { agentId, status: 'killed', checkpointId }
    },

    restart: async (agentId: string): Promise<AgentResponse> => {
      await delay(500)

      const agent = mockAgents.get(agentId)
      if (!agent) throw new Error('Agent not found')

      agent.sandboxStatus = 'active'
      agent.status = 'idle'
      agent.sandboxId = `sbx_${uuid().slice(0, 8)}`
      agent.lastHeartbeat = now()
      mockAgents.set(agentId, agent)

      emitEvent({
        type: 'agent:status',
        data: {
          agentId,
          status: 'idle',
          sandboxStatus: 'active',
        },
      })

      // Emit output showing resume
      emitEvent({
        type: 'agent:output',
        data: {
          agentId,
          stream: 'stdout',
          content: '[Resume] Loading checkpoint... Restored context successfully.',
          timestamp: now(),
        },
      })

      return agent
    },
  },

  messages: {
    list: async (limit = 50): Promise<{ messages: MessageResponse[] }> => {
      await delay(100)
      return { messages: mockMessages.slice(0, limit) }
    },
  },

  sandboxes: {
    list: async () => {
      await delay(100)
      return Array.from(mockAgents.values()).map(a => ({
        sandboxId: a.sandboxId,
        agentId: a.agentId,
        status: a.sandboxStatus,
      }))
    },
  },
}

// ============================================================
// MOCK WEBSOCKET
// ============================================================

export const createMockWsClient = (options: {
  onEvent: (event: WsEvent) => void
  onConnect?: () => void
  onDisconnect?: () => void
}) => {
  return {
    connect: () => {
      eventCallback = options.onEvent
      // Simulate connection after short delay
      setTimeout(() => {
        options.onConnect?.()
        console.log('[MockWS] Connected (mock mode)')
      }, 100)
    },
    disconnect: () => {
      eventCallback = null
      options.onDisconnect?.()
      console.log('[MockWS] Disconnected (mock mode)')
    },
    send: (_data: unknown) => {
      // Mock doesn't need to send
    },
  }
}

// ============================================================
// DEMO FLOW SIMULATION
// ============================================================

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const emitEvent = (event: WsEvent) => {
  if (eventCallback) {
    eventCallback(event)
  }
}

const runDemoFlow = async (directorId: string, task: string) => {
  // Phase 1: Director analyzes task
  await delay(1000)

  emitEvent({
    type: 'agent:output',
    data: {
      agentId: directorId,
      stream: 'stdout',
      content: `[Director] Analyzing task: "${task}"`,
      timestamp: now(),
    },
  })

  await delay(800)

  emitEvent({
    type: 'agent:output',
    data: {
      agentId: directorId,
      stream: 'stdout',
      content: '[Director] Decomposing into subtasks...',
      timestamp: now(),
    },
  })

  // Phase 2: Spawn specialists
  await delay(1200)

  const specialists: AgentResponse[] = []
  const specializations: Specialization[] = ['researcher', 'writer']

  for (const spec of specializations) {
    const specialistId = uuid()
    const sandboxId = `sbx_${uuid().slice(0, 8)}`

    const specialist: AgentResponse = {
      agentId: specialistId,
      type: 'specialist',
      specialization: spec,
      status: 'idle',
      sandboxId,
      sandboxStatus: 'active',
      parentId: directorId,
      createdAt: now(),
      lastHeartbeat: now(),
    }

    mockAgents.set(specialistId, specialist)
    specialists.push(specialist)

    emitEvent({
      type: 'agent:created',
      data: {
        agentId: specialistId,
        agentType: 'specialist',
        specialization: spec,
        sandboxId,
      },
    })

    await delay(500)
  }

  // Phase 3: Director assigns tasks
  await delay(800)

  for (const specialist of specialists) {
    const messageId = uuid()
    const threadId = uuid()

    emitEvent({
      type: 'message:new',
      data: {
        messageId,
        fromAgent: directorId,
        toAgent: specialist.agentId,
        messageType: 'task' as MessageType,
        preview: `Research ${specialist.specialization} aspects...`,
      },
    })

    mockMessages.unshift({
      messageId,
      fromAgent: directorId,
      toAgent: specialist.agentId,
      content: `Research ${specialist.specialization} aspects of the topic`,
      type: 'task',
      threadId,
      createdAt: now(),
      read: false,
    })

    await delay(300)

    // Update specialist to working
    specialist.status = 'working'
    mockAgents.set(specialist.agentId, specialist)

    emitEvent({
      type: 'agent:status',
      data: {
        agentId: specialist.agentId,
        status: 'working',
        sandboxStatus: 'active',
      },
    })
  }

  // Phase 4: Specialists work and output
  await delay(1000)

  for (const specialist of specialists) {
    // Output from specialist
    const outputs = [
      `[${specialist.specialization}] Starting analysis...`,
      `[${specialist.specialization}] Gathering data from MongoDB...`,
      `[${specialist.specialization}] Processing results...`,
    ]

    for (const output of outputs) {
      await delay(600)

      emitEvent({
        type: 'agent:output',
        data: {
          agentId: specialist.agentId,
          stream: 'stdout',
          content: output,
          timestamp: now(),
        },
      })
    }

    // Create checkpoint
    await delay(400)

    emitEvent({
      type: 'checkpoint:new',
      data: {
        checkpointId: uuid(),
        agentId: specialist.agentId,
        phase: 'analysis_complete',
        timestamp: now(),
      },
    })
  }

  // Phase 5: Results flow back
  await delay(1500)

  for (const specialist of specialists) {
    const messageId = uuid()
    const threadId = uuid()

    emitEvent({
      type: 'message:new',
      data: {
        messageId,
        fromAgent: specialist.agentId,
        toAgent: directorId,
        messageType: 'result' as MessageType,
        preview: `Completed ${specialist.specialization} analysis...`,
      },
    })

    mockMessages.unshift({
      messageId,
      fromAgent: specialist.agentId,
      toAgent: directorId,
      content: `Completed ${specialist.specialization} analysis with findings`,
      type: 'result',
      threadId,
      createdAt: now(),
      read: false,
    })

    specialist.status = 'completed'
    mockAgents.set(specialist.agentId, specialist)

    emitEvent({
      type: 'agent:status',
      data: {
        agentId: specialist.agentId,
        status: 'completed',
        sandboxStatus: 'active',
      },
    })

    await delay(400)
  }

  // Phase 6: Director aggregates
  await delay(1000)

  emitEvent({
    type: 'agent:output',
    data: {
      agentId: directorId,
      stream: 'stdout',
      content: '[Director] Aggregating specialist results...',
      timestamp: now(),
    },
  })

  await delay(800)

  emitEvent({
    type: 'agent:output',
    data: {
      agentId: directorId,
      stream: 'stdout',
      content: '[Director] Task completed successfully!',
      timestamp: now(),
    },
  })

  // Final checkpoint
  emitEvent({
    type: 'checkpoint:new',
    data: {
      checkpointId: uuid(),
      agentId: directorId,
      phase: 'task_complete',
      timestamp: now(),
    },
  })

  const director = mockAgents.get(directorId)
  if (director) {
    director.status = 'completed'
    mockAgents.set(directorId, director)

    emitEvent({
      type: 'agent:status',
      data: {
        agentId: directorId,
        status: 'completed',
        sandboxStatus: 'active',
      },
    })
  }
}

// ============================================================
// CHECK IF MOCK MODE
// ============================================================

export const isMockMode = (): boolean => {
  // Check query param
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mock') === 'true') return true
  }

  // Check env var
  if (import.meta.env.VITE_MOCK_MODE === 'true') return true

  return false
}

// ============================================================
// RESET MOCK STATE
// ============================================================

export const resetMockState = () => {
  mockAgents.clear()
}
