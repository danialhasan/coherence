import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================
// MOCK SETUP
// ============================================================

const { mockCollection } = vi.hoisted(() => {
  const mockCollection = {
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  }
  return { mockCollection }
})

vi.mock('../db/mongo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/mongo.js')>()
  return {
    ...actual,
    getTasksCollection: vi.fn().mockResolvedValue(mockCollection),
  }
})

// Import after mocks
import {
  createTask,
  assignTask,
  updateTaskStatus,
  getTask,
  getAgentTasks,
  completeTask,
} from '../coordination/tasks.js'
import type { Task } from '../db/mongo.js'

// ============================================================
// TASK MANAGEMENT UNIT TESTS
// ============================================================

describe('Task Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================
  // CREATE TASK
  // ============================================================

  describe('createTask()', () => {
    it('creates task with required fields', async () => {
      const task = await createTask({
        title: 'Research MongoDB patterns',
        description: 'Find best practices for multi-agent coordination',
      })

      expect(task).toBeDefined()
      expect(task.taskId).toBeTruthy()
      expect(task.title).toBe('Research MongoDB patterns')
      expect(task.description).toBe('Find best practices for multi-agent coordination')
      expect(task.status).toBe('pending')
      expect(task.assignedTo).toBeNull()
      expect(task.result).toBeNull()
      expect(task.createdAt).toBeInstanceOf(Date)
      expect(task.updatedAt).toBeInstanceOf(Date)
    })

    it('creates subtask with parentTaskId', async () => {
      const parentId = '550e8400-e29b-41d4-a716-446655440000'

      const task = await createTask({
        title: 'Research subtask',
        description: 'Part of larger task',
        parentTaskId: parentId,
      })

      expect(task.parentTaskId).toBe(parentId)
    })

    it('inserts task into MongoDB', async () => {
      await createTask({
        title: 'Test task',
        description: 'Testing insert',
      })

      expect(mockCollection.insertOne).toHaveBeenCalled()
      const insertedTask = mockCollection.insertOne.mock.calls[0][0]
      expect(insertedTask.title).toBe('Test task')
      expect(insertedTask.status).toBe('pending')
    })
  })

  // ============================================================
  // ASSIGN TASK
  // ============================================================

  describe('assignTask()', () => {
    it('assigns task to agent and updates status', async () => {
      const taskId = '550e8400-e29b-41d4-a716-446655440001'
      const agentId = '660e8400-e29b-41d4-a716-446655440002'

      await assignTask(taskId, agentId)

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { taskId },
        expect.objectContaining({
          $set: expect.objectContaining({
            assignedTo: agentId,
            status: 'assigned',
          }),
        })
      )
    })

    it('updates updatedAt timestamp', async () => {
      const taskId = '550e8400-e29b-41d4-a716-446655440003'
      const agentId = '660e8400-e29b-41d4-a716-446655440004'

      await assignTask(taskId, agentId)

      const call = mockCollection.updateOne.mock.calls[0]
      expect(call[1].$set.updatedAt).toBeInstanceOf(Date)
    })
  })

  // ============================================================
  // UPDATE TASK STATUS
  // ============================================================

  describe('updateTaskStatus()', () => {
    it('updates status to in_progress', async () => {
      const taskId = '550e8400-e29b-41d4-a716-446655440005'

      await updateTaskStatus(taskId, 'in_progress')

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { taskId },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'in_progress',
          }),
        })
      )
    })

    it('updates status with optional result', async () => {
      const taskId = '550e8400-e29b-41d4-a716-446655440006'
      const result = 'Task completed with findings'

      await updateTaskStatus(taskId, 'completed', result)

      const call = mockCollection.updateOne.mock.calls[0]
      expect(call[1].$set.status).toBe('completed')
      expect(call[1].$set.result).toBe(result)
    })

    it('accepts all valid status values', async () => {
      const taskId = '550e8400-e29b-41d4-a716-446655440007'
      const statuses: Array<'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed'> = [
        'pending',
        'assigned',
        'in_progress',
        'completed',
        'failed',
      ]

      for (const status of statuses) {
        vi.clearAllMocks()
        await updateTaskStatus(taskId, status)
        expect(mockCollection.updateOne).toHaveBeenCalled()
      }
    })
  })

  // ============================================================
  // GET TASK
  // ============================================================

  describe('getTask()', () => {
    it('returns task by taskId', async () => {
      const mockTask: Task = {
        taskId: '550e8400-e29b-41d4-a716-446655440008',
        parentTaskId: null,
        assignedTo: '660e8400-e29b-41d4-a716-446655440009',
        title: 'Test task',
        description: 'Test description',
        status: 'in_progress',
        result: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockCollection.findOne.mockResolvedValueOnce(mockTask)

      const task = await getTask(mockTask.taskId)

      expect(task).toEqual(mockTask)
      expect(mockCollection.findOne).toHaveBeenCalledWith({ taskId: mockTask.taskId })
    })

    it('returns null for non-existent task', async () => {
      mockCollection.findOne.mockResolvedValueOnce(null)

      const task = await getTask('non-existent-id')

      expect(task).toBeNull()
    })
  })

  // ============================================================
  // GET AGENT TASKS
  // ============================================================

  describe('getAgentTasks()', () => {
    it('returns all tasks assigned to agent', async () => {
      const agentId = '660e8400-e29b-41d4-a716-446655440010'
      const mockTasks: Task[] = [
        {
          taskId: 'task-1',
          parentTaskId: null,
          assignedTo: agentId,
          title: 'Task 1',
          description: 'First task',
          status: 'in_progress',
          result: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          taskId: 'task-2',
          parentTaskId: null,
          assignedTo: agentId,
          title: 'Task 2',
          description: 'Second task',
          status: 'assigned',
          result: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      mockCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce(mockTasks),
      })

      const tasks = await getAgentTasks(agentId)

      expect(tasks).toHaveLength(2)
      expect(mockCollection.find).toHaveBeenCalledWith({ assignedTo: agentId })
    })

    it('filters by status when provided', async () => {
      const agentId = '660e8400-e29b-41d4-a716-446655440011'

      mockCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce([]),
      })

      await getAgentTasks(agentId, 'in_progress')

      expect(mockCollection.find).toHaveBeenCalledWith({
        assignedTo: agentId,
        status: 'in_progress',
      })
    })
  })

  // ============================================================
  // COMPLETE TASK
  // ============================================================

  describe('completeTask()', () => {
    it('marks task as completed with result', async () => {
      const taskId = '550e8400-e29b-41d4-a716-446655440012'
      const result = 'Research findings: MongoDB is great for agent coordination'

      await completeTask(taskId, result)

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { taskId },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'completed',
            result,
          }),
        })
      )
    })

    it('updates updatedAt timestamp', async () => {
      const taskId = '550e8400-e29b-41d4-a716-446655440013'

      await completeTask(taskId, 'Done')

      const call = mockCollection.updateOne.mock.calls[0]
      expect(call[1].$set.updatedAt).toBeInstanceOf(Date)
    })
  })
})
