import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================
// MOCK SETUP
// ============================================================

const { mockAgentsCollection, mockTasksCollection, mockMessagesCollection, mockCheckpointsCollection } = vi.hoisted(() => {
  const mockAgentsCollection = {
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    findOne: vi.fn().mockResolvedValue(null),
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
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
  }

  const mockCheckpointsCollection = {
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    findOne: vi.fn().mockResolvedValue(null),
  }

  return { mockAgentsCollection, mockTasksCollection, mockMessagesCollection, mockCheckpointsCollection }
})

vi.mock('../db/mongo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/mongo.js')>()
  return {
    ...actual,
    getAgentsCollection: vi.fn().mockResolvedValue(mockAgentsCollection),
    getTasksCollection: vi.fn().mockResolvedValue(mockTasksCollection),
    getMessagesCollection: vi.fn().mockResolvedValue(mockMessagesCollection),
    getCheckpointsCollection: vi.fn().mockResolvedValue(mockCheckpointsCollection),
  }
})

// Mock the Claude runner
const { mockRunnerRun } = vi.hoisted(() => {
  return {
    mockRunnerRun: vi.fn().mockResolvedValue({
      content: 'I completed the research task successfully.',
      stopReason: 'end_turn',
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
  }
})

vi.mock('../sdk/runner.js', () => ({
  createClaudeRunner: vi.fn().mockReturnValue({
    run: mockRunnerRun,
  }),
  loadSkillContent: vi.fn().mockReturnValue('# Specialist Protocol'),
  buildSystemPrompt: vi.fn().mockReturnValue('System prompt'),
}))

// Import after mocks
import {
  createSpecialist,
  processTask,
  reportResult,
  checkInbox,
  executeTask,
} from '../agents/specialist.js'
import type { Task, Message } from '../db/mongo.js'

// ============================================================
// SPECIALIST AGENT UNIT TESTS
// ============================================================

describe('Specialist Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================
  // CREATE SPECIALIST
  // ============================================================

  describe('createSpecialist()', () => {
    it('creates specialist with researcher specialization', async () => {
      const specialist = await createSpecialist({
        specialization: 'researcher',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
      })

      expect(specialist).toBeDefined()
      expect(specialist.agent.type).toBe('specialist')
      expect(specialist.agent.specialization).toBe('researcher')
    })

    it('creates specialist with writer specialization', async () => {
      const specialist = await createSpecialist({
        specialization: 'writer',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
      })

      expect(specialist.agent.specialization).toBe('writer')
    })

    it('creates specialist with analyst specialization', async () => {
      const specialist = await createSpecialist({
        specialization: 'analyst',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
      })

      expect(specialist.agent.specialization).toBe('analyst')
    })

    it('registers specialist in MongoDB', async () => {
      await createSpecialist({
        specialization: 'researcher',
        parentId: '550e8400-e29b-41d4-a716-446655440001',
      })

      expect(mockAgentsCollection.insertOne).toHaveBeenCalled()
      const insertedAgent = mockAgentsCollection.insertOne.mock.calls[0][0]
      expect(insertedAgent.type).toBe('specialist')
      expect(insertedAgent.specialization).toBe('researcher')
    })

    it('links specialist to parent director', async () => {
      const parentId = '550e8400-e29b-41d4-a716-446655440002'

      await createSpecialist({
        specialization: 'writer',
        parentId,
      })

      const insertedAgent = mockAgentsCollection.insertOne.mock.calls[0][0]
      expect(insertedAgent.parentId).toBe(parentId)
    })
  })

  // ============================================================
  // CHECK INBOX
  // ============================================================

  describe('checkInbox()', () => {
    it('returns unread messages for specialist', async () => {
      const specialistId = '550e8400-e29b-41d4-a716-446655440000'
      const mockMessages: Message[] = [
        {
          messageId: 'msg-1',
          fromAgent: '660e8400-e29b-41d4-a716-446655440000',
          toAgent: specialistId,
          content: 'Task: Research MongoDB',
          type: 'task',
          threadId: 'thread-1',
          priority: 'high',
          readAt: null,
          createdAt: new Date(),
        },
      ]

      mockMessagesCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce(mockMessages),
      })

      const messages = await checkInbox(specialistId)

      expect(messages).toHaveLength(1)
      expect(messages[0].type).toBe('task')
    })

    it('returns empty array when no messages', async () => {
      mockMessagesCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce([]),
      })

      const messages = await checkInbox('specialist-no-messages')

      expect(messages).toHaveLength(0)
    })
  })

  // ============================================================
  // PROCESS TASK
  // ============================================================

  describe('processTask()', () => {
    it('processes task and returns result', async () => {
      const specialistId = '550e8400-e29b-41d4-a716-446655440001'
      const task: Task = {
        taskId: '880e8400-e29b-41d4-a716-446655440001',
        parentTaskId: null,
        assignedTo: specialistId,
        title: 'Research MongoDB patterns',
        description: 'Find coordination best practices',
        status: 'assigned',
        result: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const result = await processTask(specialistId, 'researcher', task)

      expect(result).toBeDefined()
      expect(result).toContain('completed')
    })

    it('calls Claude runner with task details', async () => {
      const specialistId = '550e8400-e29b-41d4-a716-446655440002'
      const task: Task = {
        taskId: '880e8400-e29b-41d4-a716-446655440002',
        parentTaskId: null,
        assignedTo: specialistId,
        title: 'Write documentation',
        description: 'Create user guide',
        status: 'assigned',
        result: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await processTask(specialistId, 'writer', task)

      expect(mockRunnerRun).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: specialistId,
          agentType: 'specialist',
          specialization: 'writer',
        }),
        expect.any(Function)
      )
    })
  })

  // ============================================================
  // REPORT RESULT
  // ============================================================

  describe('reportResult()', () => {
    it('sends result message to director', async () => {
      const specialistId = '550e8400-e29b-41d4-a716-446655440003'
      const directorId = '660e8400-e29b-41d4-a716-446655440001'
      const taskId = '880e8400-e29b-41d4-a716-446655440003'
      const result = 'Research completed: Found 5 patterns'

      await reportResult(specialistId, directorId, taskId, result)

      expect(mockMessagesCollection.insertOne).toHaveBeenCalled()
      const insertedMessage = mockMessagesCollection.insertOne.mock.calls[0][0]
      expect(insertedMessage.fromAgent).toBe(specialistId)
      expect(insertedMessage.toAgent).toBe(directorId)
      expect(insertedMessage.type).toBe('result')
      expect(insertedMessage.content).toContain('Research completed')
    })

    it('updates task status to completed', async () => {
      const specialistId = '550e8400-e29b-41d4-a716-446655440004'
      const directorId = '660e8400-e29b-41d4-a716-446655440002'
      const taskId = '880e8400-e29b-41d4-a716-446655440004'
      const result = 'Analysis done'

      await reportResult(specialistId, directorId, taskId, result)

      expect(mockTasksCollection.updateOne).toHaveBeenCalledWith(
        { taskId },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'completed',
            result,
          }),
        })
      )
    })
  })

  // ============================================================
  // EXECUTE TASK
  // ============================================================

  describe('executeTask()', () => {
    it('executes full task lifecycle', async () => {
      const specialist = await createSpecialist({
        specialization: 'researcher',
        parentId: '770e8400-e29b-41d4-a716-446655440001',
      })

      const task: Task = {
        taskId: '990e8400-e29b-41d4-a716-446655440001',
        parentTaskId: null,
        assignedTo: specialist.agent.agentId,
        title: 'Research task',
        description: 'Do research',
        status: 'assigned',
        result: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const result = await executeTask(specialist, task, '770e8400-e29b-41d4-a716-446655440001')

      expect(result).toBeDefined()
      // Task should be marked complete
      expect(mockTasksCollection.updateOne).toHaveBeenCalled()
    })

    it('creates checkpoint after completion', async () => {
      const specialist = await createSpecialist({
        specialization: 'analyst',
        parentId: '770e8400-e29b-41d4-a716-446655440002',
      })

      const task: Task = {
        taskId: '990e8400-e29b-41d4-a716-446655440002',
        parentTaskId: null,
        assignedTo: specialist.agent.agentId,
        title: 'Analysis task',
        description: 'Analyze data',
        status: 'assigned',
        result: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await executeTask(specialist, task, '770e8400-e29b-41d4-a716-446655440002')

      expect(mockCheckpointsCollection.insertOne).toHaveBeenCalled()
    })
  })
})
