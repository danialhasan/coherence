import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { initServer } from '@ts-rest/fastify'
import { config } from '../config.js'
import { contract } from '../contracts/api.contract.js'
import { connectToMongo, ensureIndexes, getAgentsCollection, getTasksCollection, getMessagesCollection, getSandboxTrackingCollection } from '../db/mongo.js'
import { createDirector, spawnSpecialist } from '../agents/director.js'
import { createTask, assignTask, getTask } from '../coordination/tasks.js'
import { createSandboxManager } from '../sandbox/manager.js'
import { getGlobalEmitter, formatWebSocketMessage, type EventType } from './websocket.js'

// ============================================================
// FASTIFY SERVER — REST API + WebSocket for Squad Lite
// ============================================================

let serverInstance: FastifyInstance | null = null

// Global sandbox manager
const sandboxManager = createSandboxManager()

// Global event emitter for WebSocket broadcasts
const eventEmitter = getGlobalEmitter()

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

            // Emit WebSocket event
            eventEmitter.emit('agent:created', {
              agentId: agent.agentId,
              type: agent.type,
              timestamp: new Date().toISOString(),
            })

            return {
              status: 201 as const,
              body: {
                agentId: agent.agentId,
                type: agent.type,
                status: agent.status,
                sandboxId: agent.sandboxId,
                sandboxStatus: agent.sandboxStatus,
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
              type: agent.type,
              specialization: context.specialization,
              timestamp: new Date().toISOString(),
            })

            return {
              status: 201 as const,
              body: {
                agentId: agent.agentId,
                type: agent.type,
                status: agent.status,
                sandboxId: agent.sandboxId,
                sandboxStatus: agent.sandboxStatus,
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
            timestamp: new Date().toISOString(),
          })

          return {
            status: 201 as const,
            body: {
              agentId: updated!.agentId,
              type: updated!.type,
              status: updated!.status,
              sandboxId: updated!.sandboxId,
              sandboxStatus: updated!.sandboxStatus,
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

/**
 * Start server
 */
export const startServer = async (): Promise<FastifyInstance> => {
  // Connect to MongoDB
  await connectToMongo()
  await ensureIndexes()

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
