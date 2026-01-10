import {
  initializeAgent,
  AgentContext,
  updateAgentStatus,
  send,
  receive,
  checkpoint,
} from './base.js'
import { updateTaskStatus, completeTask, getAgentTasks } from '../coordination/tasks.js'
import { getMessagesCollection, Task, Message } from '../db/mongo.js'
import { createClaudeRunner } from '../sdk/runner.js'
import { buildContextPacket, markMessagesAsRead } from '../coordination/context.js'

// ============================================================
// SPECIALIST AGENT — Task executor for specific work types
// ============================================================

export type Specialization = 'researcher' | 'writer' | 'analyst' | 'general'

export type SpecialistConfig = {
  specialization: Specialization
  parentId: string
}

export type SpecialistContext = AgentContext & {
  specialization: Specialization
  parentId: string
}

// ============================================================
// SPECIALIST LIFECYCLE
// ============================================================

/**
 * Create and initialize a Specialist agent
 */
export const createSpecialist = async (
  config: SpecialistConfig
): Promise<SpecialistContext> => {
  const context = await initializeAgent({
    type: 'specialist',
    specialization: config.specialization,
    parentId: config.parentId,
  })

  console.log(`[Specialist] Created ${config.specialization} (${context.agent.agentId.slice(0, 8)})`)

  return {
    ...context,
    specialization: config.specialization,
    parentId: config.parentId,
  }
}

// ============================================================
// MESSAGE HANDLING
// ============================================================

/**
 * Check inbox for new messages/tasks
 */
export const checkInbox = async (agentId: string): Promise<Message[]> => {
  const messages = await getMessagesCollection()

  return messages
    .find({
      toAgent: agentId,
      readAt: null,
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray()
}

/**
 * Report result back to director
 */
export const reportResult = async (
  specialistId: string,
  directorId: string,
  taskId: string,
  result: string
): Promise<void> => {
  // Mark task as completed
  await completeTask(taskId, result)

  // Send result message to director
  await send({
    fromAgent: specialistId,
    toAgent: directorId,
    content: result,
    type: 'result',
    threadId: taskId,
  })

  console.log(`[Specialist] Reported result to ${directorId.slice(0, 8)}`)
}

// ============================================================
// TASK PROCESSING
// ============================================================

/**
 * Process a task using Claude
 */
export const processTask = async (
  agentId: string,
  specialization: Specialization,
  task: Task
): Promise<string> => {
  const runner = createClaudeRunner()

  // Build task prompt
  const taskPrompt = buildTaskPrompt(task, specialization)

  console.log(`[Specialist] Processing task: ${task.title}`)

  // Run Claude
  const result = await runner.run(
    {
      agentId,
      agentType: 'specialist',
      specialization,
      task: taskPrompt,
    },
    (content) => {
      console.log(`[Specialist] Output: ${content.slice(0, 100)}...`)
    }
  )

  return result.content
}

/**
 * Build task prompt based on specialization
 */
const buildTaskPrompt = (task: Task, specialization: Specialization): string => {
  const basePrompt = `## Task: ${task.title}

${task.description}

Please complete this task thoroughly and provide a detailed response.`

  const specializationContext: Record<Specialization, string> = {
    researcher: `As a Research Specialist, focus on:
- Finding accurate and relevant information
- Citing sources where applicable
- Providing comprehensive coverage of the topic`,

    writer: `As a Writing Specialist, focus on:
- Clear and engaging prose
- Logical structure and flow
- Appropriate tone for the context`,

    analyst: `As an Analysis Specialist, focus on:
- Data-driven insights
- Identifying patterns and trends
- Providing actionable recommendations`,

    general: `Complete this task to the best of your ability.`,
  }

  return `${specializationContext[specialization]}

${basePrompt}`
}

/**
 * Execute a task and report results
 */
export const executeTask = async (
  context: SpecialistContext,
  task: Task,
  directorId: string
): Promise<string> => {
  // Update status to working
  await updateAgentStatus(context.agent.agentId, 'working', task.taskId)

  // Update task status to in_progress
  await updateTaskStatus(task.taskId, 'in_progress')

  try {
    // Process the task
    const result = await processTask(
      context.agent.agentId,
      context.specialization,
      task
    )

    // Report result to director
    await reportResult(context.agent.agentId, directorId, task.taskId, result)

    // Checkpoint
    await checkpoint({
      agentId: context.agent.agentId,
      summary: {
        goal: task.title,
        completed: [task.title],
        pending: [],
        decisions: [],
      },
      resumePointer: {
        nextAction: 'Task completed',
        phase: 'complete',
      },
      tokensUsed: 0,
    })

    // Update status
    await updateAgentStatus(context.agent.agentId, 'completed')

    return result
  } catch (error) {
    // Handle failure
    await updateTaskStatus(task.taskId, 'failed', String(error))
    await updateAgentStatus(context.agent.agentId, 'error')
    throw error
  }
}

/**
 * Run the Specialist work loop
 */
export const runSpecialist = async (context: SpecialistContext): Promise<void> => {
  console.log(`[Specialist] Starting work loop (${context.agent.agentId.slice(0, 8)})`)

  // Get assigned tasks
  const tasks = await getAgentTasks(context.agent.agentId, 'assigned')

  if (tasks.length === 0) {
    console.log(`[Specialist] No tasks assigned`)
    return
  }

  // Process each task
  for (const task of tasks) {
    const directorId = context.parentId

    try {
      await executeTask(context, task, directorId)
    } catch (error) {
      console.error(`[Specialist] Failed task ${task.taskId}:`, error)
    }
  }

  console.log(`[Specialist] Work loop complete`)
}

/**
 * Wait for and process incoming tasks (event-driven mode)
 */
export const awaitTasks = async (
  context: SpecialistContext,
  timeoutMs: number = 60000
): Promise<void> => {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    // Check for new messages
    const messages = await checkInbox(context.agent.agentId)

    // Look for task messages
    const taskMessages = messages.filter((m) => m.type === 'task')

    if (taskMessages.length > 0) {
      // Mark as read
      await markMessagesAsRead(taskMessages.map((m) => m.messageId))

      // Get the associated task
      const tasks = await getAgentTasks(context.agent.agentId, 'assigned')

      for (const task of tasks) {
        await executeTask(context, task, context.parentId)
      }
    }

    // Wait before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}
