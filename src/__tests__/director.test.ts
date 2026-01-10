import { describe, it, expect, beforeEach, vi } from 'vitest'

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
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
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
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
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
  }
})

// Mock the Claude runner
const { mockRunnerRun } = vi.hoisted(() => {
  return {
    mockRunnerRun: vi.fn().mockResolvedValue({
      content: 'I will help decompose this task.',
      stopReason: 'end_turn',
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
  }
})

vi.mock('../sdk/runner.js', () => ({
  createClaudeRunner: vi.fn().mockReturnValue({
    run: mockRunnerRun,
  }),
  loadSkillContent: vi.fn().mockReturnValue('# Director Protocol'),
  buildSystemPrompt: vi.fn().mockReturnValue('System prompt'),
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
  }),
}))

// Import after mocks
import {
  createDirector,
  spawnSpecialist,
  assignTaskToSpecialist,
  waitForSpecialists,
  aggregateResults,
} from '../agents/director.js'
import type { Agent, Task } from '../db/mongo.js'

// ============================================================
// DIRECTOR AGENT UNIT TESTS
// ============================================================

describe('Director Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================
  // CREATE DIRECTOR
  // ============================================================

  describe('createDirector()', () => {
    it('creates director with correct type', async () => {
      const director = await createDirector()

      expect(director).toBeDefined()
      expect(director.agent.type).toBe('director')
      expect(director.agent.status).toBe('idle')
    })

    it('registers director in MongoDB', async () => {
      await createDirector()

      expect(mockAgentsCollection.insertOne).toHaveBeenCalled()
      const insertedAgent = mockAgentsCollection.insertOne.mock.calls[0][0]
      expect(insertedAgent.type).toBe('director')
    })

    it('generates unique agent ID', async () => {
      await createDirector()

      const insertedAgent = mockAgentsCollection.insertOne.mock.calls[0][0]
      expect(insertedAgent.agentId).toBeTruthy()
      expect(insertedAgent.agentId.length).toBe(36) // UUID length
    })
  })

  // ============================================================
  // SPAWN SPECIALIST
  // ============================================================

  describe('spawnSpecialist()', () => {
    it('spawns researcher specialist', async () => {
      const director = await createDirector()
      const specialist = await spawnSpecialist(director.agent.agentId, 'researcher')

      expect(specialist).toBeDefined()
      expect(specialist.agent.type).toBe('specialist')
      expect(specialist.agent.specialization).toBe('researcher')
    })

    it('spawns writer specialist', async () => {
      const director = await createDirector()
      const specialist = await spawnSpecialist(director.agent.agentId, 'writer')

      expect(specialist.agent.specialization).toBe('writer')
    })

    it('spawns analyst specialist', async () => {
      const director = await createDirector()
      const specialist = await spawnSpecialist(director.agent.agentId, 'analyst')

      expect(specialist.agent.specialization).toBe('analyst')
    })

    it('links specialist to director as parent', async () => {
      const director = await createDirector()
      await spawnSpecialist(director.agent.agentId, 'researcher')

      // Check the second insertOne call (specialist)
      const insertCalls = mockAgentsCollection.insertOne.mock.calls
      const specialistInsert = insertCalls[insertCalls.length - 1][0]
      expect(specialistInsert.parentId).toBe(director.agent.agentId)
    })
  })

  // ============================================================
  // ASSIGN TASK TO SPECIALIST
  // ============================================================

  describe('assignTaskToSpecialist()', () => {
    it('creates task and assigns to specialist', async () => {
      const directorId = '550e8400-e29b-41d4-a716-446655440000'
      const specialistId = '660e8400-e29b-41d4-a716-446655440001'

      await assignTaskToSpecialist(directorId, specialistId, {
        title: 'Research MongoDB patterns',
        description: 'Find best practices for agent coordination',
      })

      // Task should be inserted
      expect(mockTasksCollection.insertOne).toHaveBeenCalled()
      const insertedTask = mockTasksCollection.insertOne.mock.calls[0][0]
      expect(insertedTask.title).toBe('Research MongoDB patterns')

      // Task should be assigned via updateOne
      expect(mockTasksCollection.updateOne).toHaveBeenCalledWith(
        { taskId: expect.any(String) },
        expect.objectContaining({
          $set: expect.objectContaining({
            assignedTo: specialistId,
            status: 'assigned',
          }),
        })
      )
    })

    it('sends task message to specialist', async () => {
      const directorId = '550e8400-e29b-41d4-a716-446655440002'
      const specialistId = '660e8400-e29b-41d4-a716-446655440003'

      await assignTaskToSpecialist(directorId, specialistId, {
        title: 'Write documentation',
        description: 'Create user guide',
      })

      // Message should be sent
      expect(mockMessagesCollection.insertOne).toHaveBeenCalled()
      const insertedMessage = mockMessagesCollection.insertOne.mock.calls[0][0]
      expect(insertedMessage.fromAgent).toBe(directorId)
      expect(insertedMessage.toAgent).toBe(specialistId)
      expect(insertedMessage.type).toBe('task')
    })
  })

  // ============================================================
  // WAIT FOR SPECIALISTS
  // ============================================================

  describe('waitForSpecialists()', () => {
    it('returns immediately when all specialists completed', async () => {
      const specialistIds = ['spec-1', 'spec-2']

      // Mock all tasks as completed
      mockTasksCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce([
          { assignedTo: 'spec-1', status: 'completed', result: 'Result 1' },
          { assignedTo: 'spec-2', status: 'completed', result: 'Result 2' },
        ] as Task[]),
      })

      const results = await waitForSpecialists(specialistIds, 1000)

      expect(results).toHaveLength(2)
    })

    it('returns results from completed specialists', async () => {
      const specialistIds = ['spec-3']

      mockTasksCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce([
          {
            taskId: 'task-1',
            assignedTo: 'spec-3',
            status: 'completed',
            result: 'Research completed successfully',
          },
        ] as Task[]),
      })

      const results = await waitForSpecialists(specialistIds, 1000)

      expect(results[0].result).toBe('Research completed successfully')
    })
  })

  // ============================================================
  // AGGREGATE RESULTS
  // ============================================================

  describe('aggregateResults()', () => {
    it('combines results from multiple specialists', async () => {
      const results: Task[] = [
        {
          taskId: 'task-1',
          parentTaskId: null,
          assignedTo: 'spec-1',
          title: 'Research',
          description: 'Research task',
          status: 'completed',
          result: 'Research findings: MongoDB is great',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          taskId: 'task-2',
          parentTaskId: null,
          assignedTo: 'spec-2',
          title: 'Analysis',
          description: 'Analysis task',
          status: 'completed',
          result: 'Analysis: Patterns identified',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const aggregated = aggregateResults(results)

      expect(aggregated).toContain('Research findings')
      expect(aggregated).toContain('Patterns identified')
    })

    it('handles empty results array', () => {
      const aggregated = aggregateResults([])

      expect(aggregated).toBe('')
    })

    it('filters out failed tasks', () => {
      const results: Task[] = [
        {
          taskId: 'task-1',
          parentTaskId: null,
          assignedTo: 'spec-1',
          title: 'Good task',
          description: '',
          status: 'completed',
          result: 'Success',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          taskId: 'task-2',
          parentTaskId: null,
          assignedTo: 'spec-2',
          title: 'Failed task',
          description: '',
          status: 'failed',
          result: 'Error: Something went wrong',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const aggregated = aggregateResults(results)

      expect(aggregated).toContain('Success')
      expect(aggregated).not.toContain('Error')
    })
  })
})
