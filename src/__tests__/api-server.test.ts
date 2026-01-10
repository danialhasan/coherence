import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'

// ============================================================
// MOCK SETUP
// ============================================================

const { mockAgentsCollection, mockTasksCollection, mockMessagesCollection } = vi.hoisted(() => {
  const mockAgentsCollection = {
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  }

  const mockTasksCollection = {
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  }

  const mockMessagesCollection = {
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
  }

  return { mockAgentsCollection, mockTasksCollection, mockMessagesCollection }
})

vi.mock('../db/mongo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/mongo.js')>()
  return {
    ...actual,
    getAgentsCollection: vi.fn().mockResolvedValue(mockAgentsCollection),
    getTasksCollection: vi.fn().mockResolvedValue(mockTasksCollection),
    getMessagesCollection: vi.fn().mockResolvedValue(mockMessagesCollection),
    getCheckpointsCollection: vi.fn().mockResolvedValue({
      insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      findOne: vi.fn().mockResolvedValue(null),
    }),
    getSandboxTrackingCollection: vi.fn().mockResolvedValue({
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      findOne: vi.fn().mockResolvedValue(null),
    }),
    connectToMongo: vi.fn().mockResolvedValue({}),
    ensureIndexes: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../config.js', () => ({
  config: {
    ANTHROPIC_API_KEY: 'sk-ant-mock-api-key',
    E2B_API_KEY: 'mock-e2b-key',
    PORT: 3001,
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://localhost/test',
    MONGODB_DB_NAME: 'squad-lite-test',
  },
}))

// Mock sandbox manager
vi.mock('../sandbox/manager.js', () => ({
  createSandboxManager: vi.fn().mockReturnValue({
    create: vi.fn().mockResolvedValue({
      sandboxId: 'sandbox-123',
      agentId: 'agent-123',
      status: 'active',
    }),
    execute: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '' }),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    kill: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue(null),
    list: vi.fn().mockReturnValue([]),
    isRunning: vi.fn().mockReturnValue(false),
    // Extended methods for full E2B integration
    runAgent: vi.fn().mockResolvedValue('Task completed successfully'),
    killSandbox: vi.fn().mockResolvedValue(undefined),
    getSandboxId: vi.fn().mockReturnValue('sandbox-123'),
    isSandboxReady: vi.fn().mockReturnValue(true),
  }),
}))

// Import after mocks
import { createServer, startServer, stopServer } from '../api/server.js'
import type { FastifyInstance } from 'fastify'

// ============================================================
// API SERVER UNIT TESTS
// ============================================================

describe('API Server', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await createServer()
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================
  // HEALTH CHECK
  // ============================================================

  describe('GET /health', () => {
    it('returns healthy status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.status).toBe('healthy')
    })
  })

  // ============================================================
  // AGENT ROUTES
  // ============================================================

  describe('POST /api/agents', () => {
    it('creates a director agent', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/agents',
        payload: {
          type: 'director',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.agentId).toBeDefined()
      expect(body.type).toBe('director')
    })
  })

  describe('GET /api/agents', () => {
    it('returns list of agents', async () => {
      mockAgentsCollection.find.mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValueOnce([
          {
            agentId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'director',
            status: 'idle',
            sandboxId: null,
            sandboxStatus: 'none',
            parentId: null,
            taskId: null,
            createdAt: new Date(),
            lastHeartbeat: new Date(),
          },
        ]),
      })

      const response = await server.inject({
        method: 'GET',
        url: '/api/agents',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.agents).toHaveLength(1)
    })
  })

  describe('GET /api/agents/:id/status', () => {
    it('returns agent status by ID', async () => {
      const agentId = '550e8400-e29b-41d4-a716-446655440001'
      mockAgentsCollection.findOne.mockResolvedValueOnce({
        agentId,
        type: 'director',
        status: 'working',
        sandboxId: 'sandbox-123',
        sandboxStatus: 'active',
        parentId: null,
        taskId: null,
        createdAt: new Date(),
        lastHeartbeat: new Date(),
      })

      const response = await server.inject({
        method: 'GET',
        url: `/api/agents/${agentId}/status`,
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.agentId).toBe(agentId)
    })

    it('returns 404 for non-existent agent', async () => {
      mockAgentsCollection.findOne.mockResolvedValueOnce(null)
      const agentId = '550e8400-e29b-41d4-a716-446655440099'

      const response = await server.inject({
        method: 'GET',
        url: `/api/agents/${agentId}/status`,
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('DELETE /api/agents/:id', () => {
    it('kills agent and returns checkpoint', async () => {
      const agentId = '550e8400-e29b-41d4-a716-446655440002'
      mockAgentsCollection.findOne.mockResolvedValueOnce({
        agentId,
        type: 'director',
        status: 'working',
        sandboxId: null,
        sandboxStatus: 'none',
        createdAt: new Date(),
        lastHeartbeat: new Date(),
      })

      const response = await server.inject({
        method: 'DELETE',
        url: `/api/agents/${agentId}`,
        payload: {}, // ts-rest requires body even if empty
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.status).toBe('killed')
    })
  })

  // ============================================================
  // TASK ROUTES
  // ============================================================

  describe('POST /api/agents/:id/task', () => {
    it('submits task to agent', async () => {
      const agentId = '550e8400-e29b-41d4-a716-446655440003'
      mockAgentsCollection.findOne.mockResolvedValueOnce({
        agentId,
        type: 'director',
        status: 'idle',
        sandboxId: null,
        sandboxStatus: 'none',
        createdAt: new Date(),
        lastHeartbeat: new Date(),
      })

      const response = await server.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/task`,
        payload: {
          task: 'Research MongoDB coordination patterns',
        },
      })

      expect(response.statusCode).toBe(200) // Contract specifies 200, not 201
      const body = JSON.parse(response.body)
      expect(body.taskId).toBeDefined()
      expect(body.status).toBe('assigned')
    })
  })

  describe('GET /api/tasks', () => {
    it('returns list of tasks', async () => {
      mockTasksCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce([
          {
            taskId: '880e8400-e29b-41d4-a716-446655440001',
            title: 'Test task',
            description: 'Test task description',
            status: 'pending',
            assignedTo: null,
            result: null,
            parentTaskId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      })

      const response = await server.inject({
        method: 'GET',
        url: '/api/tasks',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.tasks).toHaveLength(1)
      expect(body.tasks[0].taskId).toBe('880e8400-e29b-41d4-a716-446655440001')
    })
  })

  // ============================================================
  // MESSAGES ROUTES
  // ============================================================

  describe('GET /api/messages', () => {
    it('returns recent messages', async () => {
      mockMessagesCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce([
          {
            messageId: '110e8400-e29b-41d4-a716-446655440001',
            fromAgent: '550e8400-e29b-41d4-a716-446655440000',
            toAgent: '660e8400-e29b-41d4-a716-446655440000',
            content: 'Task assigned',
            type: 'task',
            threadId: '770e8400-e29b-41d4-a716-446655440000',
            priority: 'normal',
            readAt: null,
            createdAt: new Date(),
          },
        ]),
      })

      const response = await server.inject({
        method: 'GET',
        url: '/api/messages',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].read).toBe(false)
    })
  })
})
