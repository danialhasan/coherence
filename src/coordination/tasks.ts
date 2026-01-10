import { v4 as uuid } from 'uuid'
import { getTasksCollection, Task, TaskSchema } from '../db/mongo.js'

// ============================================================
// TASK MANAGEMENT — Work unit coordination via MongoDB
// ============================================================

export type CreateTaskInput = {
  title: string
  description: string
  parentTaskId?: string
}

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed'

/**
 * Create a new task
 */
export const createTask = async (input: CreateTaskInput): Promise<Task> => {
  const tasks = await getTasksCollection()

  const now = new Date()
  const task: Task = {
    taskId: uuid(),
    parentTaskId: input.parentTaskId ?? null,
    assignedTo: null,
    title: input.title,
    description: input.description,
    status: 'pending',
    result: null,
    createdAt: now,
    updatedAt: now,
  }

  // Validate with Zod before inserting
  TaskSchema.parse(task)

  await tasks.insertOne(task)
  console.log(`[Task] Created: ${task.title} (${task.taskId.slice(0, 8)})`)

  return task
}

/**
 * Assign a task to an agent
 */
export const assignTask = async (taskId: string, agentId: string): Promise<void> => {
  const tasks = await getTasksCollection()

  await tasks.updateOne(
    { taskId },
    {
      $set: {
        assignedTo: agentId,
        status: 'assigned' as TaskStatus,
        updatedAt: new Date(),
      },
    }
  )

  console.log(`[Task] Assigned ${taskId.slice(0, 8)} → ${agentId.slice(0, 8)}`)
}

/**
 * Update task status (with optional result)
 */
export const updateTaskStatus = async (
  taskId: string,
  status: TaskStatus,
  result?: string
): Promise<void> => {
  const tasks = await getTasksCollection()

  const update: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  }

  if (result !== undefined) {
    update.result = result
  }

  await tasks.updateOne({ taskId }, { $set: update })
  console.log(`[Task] ${taskId.slice(0, 8)} → ${status}`)
}

/**
 * Get a task by ID
 */
export const getTask = async (taskId: string): Promise<Task | null> => {
  const tasks = await getTasksCollection()
  return tasks.findOne({ taskId })
}

/**
 * Get all tasks assigned to an agent (optionally filtered by status)
 */
export const getAgentTasks = async (
  agentId: string,
  status?: TaskStatus
): Promise<Task[]> => {
  const tasks = await getTasksCollection()

  const query: Record<string, unknown> = { assignedTo: agentId }
  if (status) {
    query.status = status
  }

  return tasks.find(query).sort({ createdAt: -1 }).toArray()
}

/**
 * Complete a task with result
 */
export const completeTask = async (taskId: string, result: string): Promise<void> => {
  const tasks = await getTasksCollection()

  await tasks.updateOne(
    { taskId },
    {
      $set: {
        status: 'completed' as TaskStatus,
        result,
        updatedAt: new Date(),
      },
    }
  )

  console.log(`[Task] Completed: ${taskId.slice(0, 8)}`)
}

/**
 * Get subtasks of a parent task
 */
export const getSubtasks = async (parentTaskId: string): Promise<Task[]> => {
  const tasks = await getTasksCollection()
  return tasks.find({ parentTaskId }).sort({ createdAt: 1 }).toArray()
}

/**
 * Mark task as failed
 */
export const failTask = async (taskId: string, error: string): Promise<void> => {
  const tasks = await getTasksCollection()

  await tasks.updateOne(
    { taskId },
    {
      $set: {
        status: 'failed' as TaskStatus,
        result: `Error: ${error}`,
        updatedAt: new Date(),
      },
    }
  )

  console.log(`[Task] Failed: ${taskId.slice(0, 8)} - ${error}`)
}
