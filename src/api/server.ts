import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { initServer } from '@ts-rest/fastify'
import { config } from '../config.js'
import { contract } from '../contracts/api.contract.js'
import { connectToMongo, ensureIndexes, getAgentsCollection, getTasksCollection, getMessagesCollection, getSandboxTrackingCollection, getCheckpointsCollection, type Task } from '../db/mongo.js'
import { createDirector, spawnSpecialist, orchestrate } from '../agents/director.js'
import { createTask, assignTask, getTask } from '../coordination/tasks.js'
import { createSandboxManager, type ExtendedSandboxManager, type OutputHandler } from '../sandbox/manager.js'
import { getGlobalEmitter, formatWebSocketMessage, type EventType } from './websocket.js'
import { buildContextPacket } from '../coordination/context.js'

// ============================================================
// FASTIFY SERVER — REST API + WebSocket for Squad Lite
// ============================================================
//
// NEW ARCHITECTURE (Full E2B Integration):
// - All agents run INSIDE a single E2B sandbox
// - Claude SDK runs inside the sandbox (not main process)
// - UI is a window into the sandbox (streaming stdout/stderr)
// - Kill agent = kill process (sandbox stays)
// - Kill sandbox = kill all agents
//

let serverInstance: FastifyInstance | null = null

// Global event emitter for WebSocket broadcasts
const eventEmitter = getGlobalEmitter()

// Output handler that streams sandbox output to WebSocket
const outputHandler: OutputHandler = (agentId, stream, data) => {
  eventEmitter.emit('agent:output', {
    agentId,
    stream,
    content: data,  // Fixed: was 'output', contract expects 'content'
    timestamp: new Date().toISOString(),
  })
}

// Global sandbox manager with output streaming
const sandboxManager = createSandboxManager(outputHandler) as ExtendedSandboxManager

/**
 * Create Fastify server with ts-rest routes + WebSocket
 */
export const createServer = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
  })

  // Enable CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })

  // Enable WebSocket
  await app.register(websocket)

  // ============================================================
  // HEALTH CHECK (vanilla route - not in contract)
  // ============================================================

  app.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    }
  })

  // ============================================================
  // TS-REST ROUTER
  // ============================================================

  const s = initServer()

  const router = s.router(contract, {
    // ============================================================
    // AGENT ROUTES
    // ============================================================
    agents: {
      list: async () => {
        const agents = await getAgentsCollection()
        const agentList = await agents.find().toArray()

        return {
          status: 200 as const,
          body: {
            agents: agentList.map(a => ({
              agentId: a.agentId,
              type: a.type,
              status: a.status,
              sandboxId: a.sandboxId,
              sandboxStatus: a.sandboxStatus,
              specialization: a.specialization,
              parentId: a.parentId ?? null,
              taskId: a.taskId ?? null,
              createdAt: a.createdAt.toISOString(),
              lastHeartbeat: a.lastHeartbeat.toISOString(),
            })),
          },
        }
      },

      spawn: async ({ body }) => {
        try {
          const agentType = body.type || 'director'

          if (agentType === 'director') {
            const context = await createDirector()
            const agent = context.agent

            // Emit WebSocket event (per FULL-SPEC.md: agentType, sandboxId)
            eventEmitter.emit('agent:created', {
              agentId: agent.agentId,
              agentType: agent.type,
              sandboxId: agent.sandboxId,
            })

            return {
              status: 201 as const,
              body: {
                agentId: agent.agentId,
                type: agent.type,
                status: agent.status,
                sandboxId: agent.sandboxId,
                sandboxStatus: agent.sandboxStatus,
                specialization: agent.specialization,
                parentId: agent.parentId ?? null,
                taskId: agent.taskId ?? null,
                createdAt: agent.createdAt.toISOString(),
                lastHeartbeat: agent.lastHeartbeat.toISOString(),
              },
            }
          } else if (agentType === 'specialist' && body.parentId) {
            const context = await spawnSpecialist(
              body.parentId,
              body.specialization || 'general'
            )
            const agent = context.agent

            eventEmitter.emit('agent:created', {
              agentId: agent.agentId,
              agentType: agent.type,
              sandboxId: agent.sandboxId,
            })

            return {
              status: 201 as const,
              body: {
                agentId: agent.agentId,
                type: agent.type,
                status: agent.status,
                sandboxId: agent.sandboxId,
                sandboxStatus: agent.sandboxStatus,
                specialization: agent.specialization,
                parentId: agent.parentId ?? null,
                taskId: agent.taskId ?? null,
                createdAt: agent.createdAt.toISOString(),
                lastHeartbeat: agent.lastHeartbeat.toISOString(),
              },
            }
          } else {
            // Default to director
            const context = await createDirector()
            const agent = context.agent

            return {
              status: 201 as const,
              body: {
                agentId: agent.agentId,
                type: agent.type,
                status: agent.status,
                sandboxId: agent.sandboxId,
                sandboxStatus: agent.sandboxStatus,
                specialization: agent.specialization,
                parentId: agent.parentId ?? null,
                taskId: agent.taskId ?? null,
                createdAt: agent.createdAt.toISOString(),
                lastHeartbeat: agent.lastHeartbeat.toISOString(),
              },
            }
          }
        } catch (error) {
          return {
            status: 500 as const,
            body: {
              error: 'spawn_failed',
              message: String(error),
              statusCode: 500,
            },
          }
        }
      },

      submitTask: async ({ params, body }) => {
        const agents = await getAgentsCollection()
        const agent = await agents.findOne({ agentId: params.id })

        if (!agent) {
          return {
            status: 404 as const,
            body: {
              error: 'not_found',
              message: `Agent ${params.id} not found`,
              statusCode: 404,
            },
          }
        }

        try {
          const task = await createTask({
            title: body.task.slice(0, 100),
            description: body.task,
          })

          await assignTask(task.taskId, params.id)

          eventEmitter.emit('task:created', {
            taskId: task.taskId,
            title: task.title,
            assignedTo: params.id,
            timestamp: new Date().toISOString(),
          })

          // FULL E2B INTEGRATION:
          // Run agent inside E2B sandbox with Claude SDK
          // Output is streamed to WebSocket via outputHandler
          setImmediate(async () => {
            try {
              console.log(`[Server] Starting E2B agent execution for task: ${task.taskId}`)

              // Update agent status (per FULL-SPEC.md: include sandboxStatus)
              eventEmitter.emit('agent:status', { agentId: params.id, status: 'working', sandboxStatus: 'active' })

              // Register agent in sandbox
              await sandboxManager.create({
                agentId: params.id,
                agentType: agent.type as 'director' | 'specialist',
                specialization: agent.specialization as 'researcher' | 'writer' | 'analyst' | 'general' | undefined,
              })

              // Run agent inside E2B sandbox
              const rawResult = await sandboxManager.runAgent(params.id, body.task)
              const result = extractAgentResult(rawResult)

              // Update task with result
              const tasks = await getTasksCollection()
              await tasks.updateOne(
                { taskId: task.taskId },
                { $set: { status: 'completed', result, updatedAt: new Date() } }
              )

              // Emit completion events
              eventEmitter.emit('task:status', {
                taskId: task.taskId,
                status: 'completed',
                timestamp: new Date().toISOString(),
              })
              eventEmitter.emit('agent:status', { agentId: params.id, status: 'completed', sandboxStatus: 'active' })

              console.log(`[Server] Agent execution completed for task: ${task.taskId}`)

            } catch (error) {
              console.error('[Server] Agent execution failed:', error)

              // Update task status in MongoDB with error details
              const tasksCollection = await getTasksCollection()
              await tasksCollection.updateOne(
                { taskId: task.taskId },
                { $set: { status: 'failed', result: `Error: ${String(error)}`, updatedAt: new Date() } }
              )

              eventEmitter.emit('agent:status', { agentId: params.id, status: 'error', sandboxStatus: 'active' })
              eventEmitter.emit('task:status', {
                taskId: task.taskId,
                status: 'failed',
                error: String(error),
                timestamp: new Date().toISOString(),
              })
            }
          })

          return {
            status: 200 as const,
            body: {
              taskId: task.taskId,
              status: 'assigned' as const,
              agentId: params.id,
            },
          }
        } catch (error) {
          return {
            status: 500 as const,
            body: {
              error: 'task_failed',
              message: String(error),
              statusCode: 500,
            },
          }
        }
      },

      getStatus: async ({ params }) => {
        const agents = await getAgentsCollection()
        const agent = await agents.findOne({ agentId: params.id })

        if (!agent) {
          return {
            status: 404 as const,
            body: {
              error: 'not_found',
              message: `Agent ${params.id} not found`,
              statusCode: 404,
            },
          }
        }

        return {
          status: 200 as const,
          body: {
            agentId: agent.agentId,
            type: agent.type,
            status: agent.status,
            sandboxId: agent.sandboxId,
            sandboxStatus: agent.sandboxStatus,
            specialization: agent.specialization,
            parentId: agent.parentId ?? null,
            taskId: agent.taskId ?? null,
            createdAt: agent.createdAt.toISOString(),
            lastHeartbeat: agent.lastHeartbeat.toISOString(),
          },
        }
      },

      kill: async ({ params }) => {
        const agents = await getAgentsCollection()
        const agent = await agents.findOne({ agentId: params.id })

        if (!agent) {
          return {
            status: 404 as const,
            body: {
              error: 'not_found',
              message: `Agent ${params.id} not found`,
              statusCode: 404,
            },
          }
        }

        try {
          // Kill sandbox if exists
          if (sandboxManager.isRunning(params.id)) {
            await sandboxManager.kill(params.id)
          }

          await agents.updateOne(
            { agentId: params.id },
            { $set: { status: 'completed', sandboxStatus: 'killed', lastHeartbeat: new Date() } }
          )

          eventEmitter.emit('agent:killed', {
            agentId: params.id,
            timestamp: new Date().toISOString(),
          })

          return {
            status: 200 as const,
            body: {
              agentId: params.id,
              status: 'killed' as const,
              checkpointId: null,
            },
          }
        } catch (error) {
          return {
            status: 500 as const,
            body: {
              error: 'kill_failed',
              message: String(error),
              statusCode: 500,
            },
          }
        }
      },

      restart: async ({ params }) => {
        const agents = await getAgentsCollection()
        const agent = await agents.findOne({ agentId: params.id })

        if (!agent) {
          return {
            status: 404 as const,
            body: {
              error: 'not_found',
              message: `Agent ${params.id} not found`,
              statusCode: 404,
            },
          }
        }

        try {
          await agents.updateOne(
            { agentId: params.id },
            { $set: { status: 'idle', lastHeartbeat: new Date() } }
          )

          const updated = await agents.findOne({ agentId: params.id })

          eventEmitter.emit('agent:status', {
            agentId: params.id,
            status: 'idle',
            sandboxStatus: updated?.sandboxStatus ?? 'none',
          })

          return {
            status: 201 as const,
            body: {
              agentId: updated!.agentId,
              type: updated!.type,
              status: updated!.status,
              sandboxId: updated!.sandboxId,
              sandboxStatus: updated!.sandboxStatus,
              specialization: updated!.specialization,
              parentId: updated!.parentId ?? null,
              taskId: updated!.taskId ?? null,
              createdAt: updated!.createdAt.toISOString(),
              lastHeartbeat: updated!.lastHeartbeat.toISOString(),
            },
          }
        } catch (error) {
          return {
            status: 500 as const,
            body: {
              error: 'restart_failed',
              message: String(error),
              statusCode: 500,
            },
          }
        }
      },
    },

    // ============================================================
    // SANDBOX ROUTES
    // ============================================================
    sandboxes: {
      list: async () => {
        const collection = await getSandboxTrackingCollection()
        const sandboxes = await collection.find().toArray()

        return {
          status: 200 as const,
          body: {
            sandboxes: sandboxes.map(s => ({
              sandboxId: s.sandboxId,
              agentId: s.agentId,
              status: s.status,
              metadata: {
                agentType: s.metadata.agentType,
                specialization: s.metadata.specialization,
                createdBy: s.metadata.createdBy,
              },
              lifecycle: {
                createdAt: s.lifecycle.createdAt.toISOString(),
                pausedAt: s.lifecycle.pausedAt?.toISOString() ?? null,
                resumedAt: s.lifecycle.resumedAt?.toISOString() ?? null,
                killedAt: s.lifecycle.killedAt?.toISOString() ?? null,
                lastHeartbeat: s.lifecycle.lastHeartbeat.toISOString(),
              },
              resources: s.resources,
              costs: s.costs,
            })),
          },
        }
      },

      get: async ({ params }) => {
        const collection = await getSandboxTrackingCollection()
        const sandbox = await collection.findOne({ sandboxId: params.id })

        if (!sandbox) {
          return {
            status: 404 as const,
            body: {
              error: 'not_found',
              message: `Sandbox ${params.id} not found`,
              statusCode: 404,
            },
          }
        }

        return {
          status: 200 as const,
          body: {
            sandboxId: sandbox.sandboxId,
            agentId: sandbox.agentId,
            status: sandbox.status,
            metadata: {
              agentType: sandbox.metadata.agentType,
              specialization: sandbox.metadata.specialization,
              createdBy: sandbox.metadata.createdBy,
            },
            lifecycle: {
              createdAt: sandbox.lifecycle.createdAt.toISOString(),
              pausedAt: sandbox.lifecycle.pausedAt?.toISOString() ?? null,
              resumedAt: sandbox.lifecycle.resumedAt?.toISOString() ?? null,
              killedAt: sandbox.lifecycle.killedAt?.toISOString() ?? null,
              lastHeartbeat: sandbox.lifecycle.lastHeartbeat.toISOString(),
            },
            resources: sandbox.resources,
            costs: sandbox.costs,
          },
        }
      },

      pause: async ({ params }) => {
        const collection = await getSandboxTrackingCollection()
        const sandbox = await collection.findOne({ sandboxId: params.id })

        if (!sandbox) {
          return {
            status: 404 as const,
            body: {
              error: 'not_found',
              message: `Sandbox ${params.id} not found`,
              statusCode: 404,
            },
          }
        }

        try {
          await sandboxManager.pause(sandbox.agentId)

          eventEmitter.emit('sandbox:event', {
            sandboxId: params.id,
            agentId: sandbox.agentId,
            event: 'paused',
            timestamp: new Date().toISOString(),
          })

          return {
            status: 200 as const,
            body: {
              sandboxId: params.id,
              status: 'paused' as const,
            },
          }
        } catch (error) {
          return {
            status: 500 as const,
            body: {
              error: 'pause_failed',
              message: String(error),
              statusCode: 500,
            },
          }
        }
      },

      resume: async ({ params }) => {
        const collection = await getSandboxTrackingCollection()
        const sandbox = await collection.findOne({ sandboxId: params.id })

        if (!sandbox) {
          return {
            status: 404 as const,
            body: {
              error: 'not_found',
              message: `Sandbox ${params.id} not found`,
              statusCode: 404,
            },
          }
        }

        try {
          await sandboxManager.resume(sandbox.agentId)

          eventEmitter.emit('sandbox:event', {
            sandboxId: params.id,
            agentId: sandbox.agentId,
            event: 'resumed',
            timestamp: new Date().toISOString(),
          })

          return {
            status: 200 as const,
            body: {
              sandboxId: params.id,
              status: 'active' as const,
            },
          }
        } catch (error) {
          return {
            status: 500 as const,
            body: {
              error: 'resume_failed',
              message: String(error),
              statusCode: 500,
            },
          }
        }
      },

      kill: async ({ params }) => {
        const collection = await getSandboxTrackingCollection()
        const sandbox = await collection.findOne({ sandboxId: params.id })

        if (!sandbox) {
          return {
            status: 404 as const,
            body: {
              error: 'not_found',
              message: `Sandbox ${params.id} not found`,
              statusCode: 404,
            },
          }
        }

        try {
          await sandboxManager.kill(sandbox.agentId)

          eventEmitter.emit('sandbox:event', {
            sandboxId: params.id,
            agentId: sandbox.agentId,
            event: 'killed',
            timestamp: new Date().toISOString(),
          })

          return {
            status: 200 as const,
            body: {
              sandboxId: params.id,
              status: 'killed' as const,
            },
          }
        } catch (error) {
          return {
            status: 500 as const,
            body: {
              error: 'kill_failed',
              message: String(error),
              statusCode: 500,
            },
          }
        }
      },
    },

    // ============================================================
    // TASK ROUTES
    // ============================================================
    tasks: {
      list: async () => {
        const tasks = await getTasksCollection()
        const taskList = await tasks.find().sort({ createdAt: -1 }).toArray()

        return {
          status: 200 as const,
          body: {
            tasks: taskList.map(t => ({
              taskId: t.taskId,
              title: t.title,
              description: t.description,
              status: t.status,
              assignedTo: t.assignedTo,
              result: t.result,
              createdAt: t.createdAt.toISOString(),
              completedAt: t.status === 'completed' ? t.updatedAt.toISOString() : null,
            })),
          },
        }
      },

      get: async ({ params }) => {
        const task = await getTask(params.id)

        if (!task) {
          return {
            status: 404 as const,
            body: {
              error: 'not_found',
              message: `Task ${params.id} not found`,
              statusCode: 404,
            },
          }
        }

        return {
          status: 200 as const,
          body: {
            taskId: task.taskId,
            title: task.title,
            description: task.description,
            status: task.status,
            assignedTo: task.assignedTo,
            result: task.result,
            createdAt: task.createdAt.toISOString(),
            completedAt: task.status === 'completed' ? task.updatedAt.toISOString() : null,
          },
        }
      },
    },

    // ============================================================
    // MESSAGE ROUTES
    // ============================================================
    messages: {
      list: async ({ query }) => {
        const limit = query.limit ?? 50
        const messages = await getMessagesCollection()
        const messageList = await messages.find().sort({ createdAt: -1 }).limit(limit).toArray()

        return {
          status: 200 as const,
          body: {
            messages: messageList.map(m => ({
              messageId: m.messageId,
              fromAgent: m.fromAgent,
              toAgent: m.toAgent,
              content: m.content,
              type: m.type,
              threadId: m.threadId,
              createdAt: m.createdAt.toISOString(),
              read: m.readAt !== null,
            })),
          },
        }
      },
    },
  })

  // Register ts-rest router
  app.register(s.plugin(router))

  // ============================================================
  // CUSTOM ROUTES (not in ts-rest contract)
  // ============================================================

  /**
   * Kill entire sandbox (all agents)
   * DELETE /api/sandbox
   */
  app.delete('/api/sandbox', async () => {
    try {
      const sandboxId = sandboxManager.getSandboxId()

      if (!sandboxId) {
        return {
          status: 'no_sandbox',
          message: 'No active sandbox',
        }
      }

      await sandboxManager.killSandbox()

      eventEmitter.emit('sandbox:event', {
        sandboxId,
        event: 'killed',
        allAgents: true,
        timestamp: new Date().toISOString(),
      })

      return {
        status: 'killed',
        sandboxId,
        message: 'Sandbox and all agents terminated',
      }
    } catch (error) {
      return {
        status: 'error',
        message: String(error),
      }
    }
  })

  /**
   * Get sandbox status
   * GET /api/sandbox/status
   */
  app.get('/api/sandbox/status', async () => {
    const sandboxId = sandboxManager.getSandboxId()
    const isReady = sandboxManager.isSandboxReady()
    const agents = sandboxManager.list()

    return {
      sandboxId,
      isReady,
      agentCount: agents.length,
      agents: agents.map(a => ({
        agentId: a.agentId,
        status: a.status,
      })),
    }
  })

  // ============================================================
  // WEBSOCKET HANDLER
  // ============================================================

  app.get('/ws', { websocket: true }, (socket) => {
    console.log('[WebSocket] Client connected')

    // Event types to subscribe to
    const eventTypes: EventType[] = [
      'agent:created',
      'agent:status',
      'agent:output',
      'agent:killed',
      'message:new',
      'checkpoint:new',
      'task:created',
      'task:status',
      'sandbox:event',
    ]

    // Create handlers for each event
    const handlers: Record<string, (data: Record<string, unknown>) => void> = {}

    eventTypes.forEach((eventType) => {
      handlers[eventType] = (data: Record<string, unknown>) => {
        try {
          socket.send(formatWebSocketMessage(eventType, data))
        } catch (error) {
          console.error(`[WebSocket] Failed to send ${eventType}:`, error)
        }
      }
      eventEmitter.on(eventType, handlers[eventType])
    })

    // Handle client messages (commands)
    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const message = JSON.parse(raw.toString())
        console.log('[WebSocket] Received:', message)
        // Handle client commands if needed
      } catch (error) {
        console.error('[WebSocket] Invalid message:', error)
      }
    })

    // Cleanup on close
    socket.on('close', () => {
      console.log('[WebSocket] Client disconnected')
      eventTypes.forEach((eventType) => {
        eventEmitter.off(eventType, handlers[eventType])
      })
    })
  })

  return app
}

// ============================================================
// SPECIALIST AUTO-START VIA MONGODB CHANGE STREAMS
// ============================================================
// Watches for task assignments and auto-starts specialist agents in sandbox
//
// Flow:
// 1. Director spawns specialist (creates MongoDB record with status: 'idle')
// 2. Director assigns task to specialist (tasks.assignedTo)
// 3. Change stream detects task assignment
// 4. Server auto-starts specialist in sandbox
// 5. Specialist completes task, director's waitForSpecialists sees result
//

// Track specialists being started to avoid double-starts
const startingSpecialists = new Set<string>()

const extractAgentResult = (output: string): string => {
  const markers = [
    { start: '=== DIRECTOR OUTPUT ===', end: '=== END OUTPUT ===' },
    { start: '=== SPECIALIST OUTPUT ===', end: '=== END OUTPUT ===' },
  ]

  for (const marker of markers) {
    const startIdx = output.indexOf(marker.start)
    if (startIdx === -1) continue
    const endIdx = output.indexOf(marker.end, startIdx + marker.start.length)
    if (endIdx === -1) continue
    return output.slice(startIdx + marker.start.length, endIdx).trim()
  }

  return output.trim()
}

const startSpecialistForTask = async (task: Task): Promise<void> => {
  if (!task.assignedTo) return
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'in_progress') return

  const agentId = task.assignedTo
  if (startingSpecialists.has(agentId)) return
  if (sandboxManager.isRunning(agentId)) return

  const agents = await getAgentsCollection()
  let agent = await agents.findOne({ agentId })

  if (!agent) {
    // Small retry in case task assignment arrives before agent insert
    await new Promise(resolve => setTimeout(resolve, 250))
    agent = await agents.findOne({ agentId })
  }

  if (!agent || agent.type !== 'specialist' || !agent.parentId) return

  const tasks = await getTasksCollection()
  startingSpecialists.add(agentId)
  try {
    console.log(`[Server] Auto-starting specialist ${agentId.slice(0, 8)} for task: ${task.title.slice(0, 50)}...`)

    await tasks.updateOne(
      { taskId: task.taskId, status: { $in: ['pending', 'assigned'] } },
      { $set: { status: 'in_progress', updatedAt: new Date() } }
    )

    eventEmitter.emit('agent:status', {
      agentId,
      status: 'working',
      sandboxStatus: 'active',
    })

    await sandboxManager.create({
      agentId,
      agentType: 'specialist',
      specialization: agent.specialization as 'researcher' | 'writer' | 'analyst' | 'general' | undefined,
    })

    const taskDescription = `${task.title}\n\n${task.description}`
    const rawResult = await sandboxManager.runAgent(agentId, taskDescription, agent.parentId ?? undefined)
    const result = extractAgentResult(rawResult)

    await tasks.updateOne(
      { taskId: task.taskId },
      { $set: { status: 'completed', result, updatedAt: new Date() } }
    )

    eventEmitter.emit('task:status', {
      taskId: task.taskId,
      status: 'completed',
      timestamp: new Date().toISOString(),
    })
    eventEmitter.emit('agent:status', {
      agentId,
      status: 'completed',
      sandboxStatus: 'active',
    })

    console.log(`[Server] Specialist ${agentId.slice(0, 8)} completed task: ${task.taskId.slice(0, 8)}`)
  } catch (error) {
    console.error(`[Server] Specialist ${agentId.slice(0, 8)} failed:`, error)

    await tasks.updateOne(
      { taskId: task.taskId },
      { $set: { status: 'failed', result: `Error: ${String(error)}`, updatedAt: new Date() } }
    )

    eventEmitter.emit('agent:status', {
      agentId,
      status: 'error',
      sandboxStatus: 'active',
    })
    eventEmitter.emit('task:status', {
      taskId: task.taskId,
      status: 'failed',
      error: String(error),
      timestamp: new Date().toISOString(),
    })
  } finally {
    startingSpecialists.delete(agentId)
  }
}

/**
 * Set up Change Stream to auto-start specialists when tasks are assigned
 */
const setupSpecialistAutoStart = async () => {
  const tasks = await getTasksCollection()

  const changeStream = tasks.watch([
    {
      $match: {
        operationType: { $in: ['insert', 'update', 'replace'] },
        'fullDocument.assignedTo': { $exists: true, $ne: null },
        'fullDocument.status': { $in: ['pending', 'assigned'] },
      },
    },
  ], { fullDocument: 'updateLookup' })

  console.log('[Server] Specialist auto-start Change Stream enabled')

  changeStream.on('change', async (change) => {
    try {
      const doc = change.fullDocument as Task | undefined
      if (!doc) return
      await startSpecialistForTask(doc)
    } catch (error) {
      console.error('[Server] Error in specialist auto-start:', error)
    }
  })

  changeStream.on('error', (error) => {
    console.error('[Server] Change Stream error:', error)
  })

  return changeStream
}

const buildPreview = (content: string): string =>
  content.length > 50 ? `${content.slice(0, 50)}...` : content

const setupMessageStream = async () => {
  const messages = await getMessagesCollection()

  const changeStream = messages.watch([
    { $match: { operationType: 'insert' } },
  ], { fullDocument: 'default' })

  console.log('[Server] Message Change Stream enabled')

  changeStream.on('change', (change) => {
    const doc = change.fullDocument
    if (!doc) return
    eventEmitter.emit('message:new', {
      messageId: doc.messageId,
      fromAgent: doc.fromAgent,
      toAgent: doc.toAgent,
      messageType: doc.type,
      preview: buildPreview(doc.content),
    })
  })

  changeStream.on('error', (error) => {
    console.error('[Server] Message Change Stream error:', error)
  })

  return changeStream
}

const setupCheckpointStream = async () => {
  const checkpoints = await getCheckpointsCollection()

  const changeStream = checkpoints.watch([
    { $match: { operationType: 'insert' } },
  ], { fullDocument: 'default' })

  console.log('[Server] Checkpoint Change Stream enabled')

  changeStream.on('change', (change) => {
    const doc = change.fullDocument
    if (!doc) return
    eventEmitter.emit('checkpoint:new', {
      checkpointId: doc.checkpointId,
      agentId: doc.agentId,
      phase: doc.resumePointer?.phase ?? 'unknown',
      timestamp: doc.createdAt?.toISOString?.() ?? new Date().toISOString(),
    })
  })

  changeStream.on('error', (error) => {
    console.error('[Server] Checkpoint Change Stream error:', error)
  })

  return changeStream
}

/**
 * Start server
 */
export const startServer = async (): Promise<FastifyInstance> => {
  // Connect to MongoDB
  await connectToMongo()
  await ensureIndexes()

  // Set up specialist auto-start (MongoDB Change Stream)
  await setupSpecialistAutoStart()
  await setupMessageStream()
  await setupCheckpointStream()

  // Create and start server
  const server = await createServer()
  await server.listen({ port: config.PORT, host: config.HOST })

  serverInstance = server
  console.log(`[Server] Listening on ${config.HOST}:${config.PORT}`)

  return server
}

/**
 * Stop server
 */
export const stopServer = async (): Promise<void> => {
  if (serverInstance) {
    await serverInstance.close()
    serverInstance = null
    console.log('[Server] Stopped')
  }
}

// Export event emitter for use elsewhere
export { eventEmitter }

// Start if running directly
if (process.argv[1]?.includes('server')) {
  startServer().catch(console.error)
}
