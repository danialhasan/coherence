import { v4 as uuid } from 'uuid'
import {
  initializeAgent,
  AgentContext,
  updateAgentStatus,
  send,
  receive,
  checkpoint,
} from './base.js'
import { createTask, assignTask, getTask } from '../coordination/tasks.js'
import { getTasksCollection, Task, Agent, getAgentsCollection } from '../db/mongo.js'
import { createClaudeRunner } from '../sdk/runner.js'
import { buildContextPacket } from '../coordination/context.js'

// ============================================================
// DIRECTOR AGENT — Orchestrator for multi-agent coordination
// ============================================================

export type DirectorContext = AgentContext

export type SpecialistContext = AgentContext & {
  specialization: 'researcher' | 'writer' | 'analyst' | 'general'
}

export type TaskAssignment = {
  title: string
  description: string
}

// ============================================================
// DIRECTOR LIFECYCLE
// ============================================================

/**
 * Create and initialize a Director agent
 */
export const createDirector = async (): Promise<DirectorContext> => {
  const context = await initializeAgent({
    type: 'director',
  })

  console.log(`[Director] Created (${context.agent.agentId.slice(0, 8)})`)

  return context
}

/**
 * Spawn a Specialist agent under this Director
 */
export const spawnSpecialist = async (
  directorId: string,
  specialization: 'researcher' | 'writer' | 'analyst' | 'general'
): Promise<SpecialistContext> => {
  const context = await initializeAgent({
    type: 'specialist',
    specialization,
    parentId: directorId,
  })

  console.log(`[Director] Spawned ${specialization} specialist (${context.agent.agentId.slice(0, 8)})`)

  return {
    ...context,
    specialization,
  }
}

/**
 * Get all specialists under this Director
 */
export const getSpecialists = async (directorId: string): Promise<Agent[]> => {
  const agents = await getAgentsCollection()
  return agents.find({ parentId: directorId }).toArray()
}

// ============================================================
// TASK MANAGEMENT
// ============================================================

/**
 * Create and assign a task to a specialist
 */
export const assignTaskToSpecialist = async (
  directorId: string,
  specialistId: string,
  task: TaskAssignment
): Promise<Task> => {
  // Create the task
  const createdTask = await createTask({
    title: task.title,
    description: task.description,
  })

  // Assign to specialist
  await assignTask(createdTask.taskId, specialistId)

  // Send task message to specialist
  await send({
    fromAgent: directorId,
    toAgent: specialistId,
    content: `Task assigned: ${task.title}\n\n${task.description}`,
    type: 'task',
    threadId: createdTask.taskId,
  })

  console.log(`[Director] Assigned task "${task.title}" to ${specialistId.slice(0, 8)}`)

  return createdTask
}

/**
 * Wait for specialists to complete their tasks
 */
export const waitForSpecialists = async (
  specialistIds: string[],
  timeoutMs: number = 60000
): Promise<Task[]> => {
  const tasks = await getTasksCollection()
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    // Get all tasks assigned to these specialists
    const specialistTasks = await tasks
      .find({ assignedTo: { $in: specialistIds } })
      .sort({ createdAt: -1 })
      .toArray()

    // Check if all have completed or failed
    const pendingTasks = specialistTasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'failed'
    )

    if (pendingTasks.length === 0 && specialistTasks.length > 0) {
      return specialistTasks
    }

    // Wait before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  // Timeout - return what we have
  const finalTasks = await tasks
    .find({ assignedTo: { $in: specialistIds } })
    .sort({ createdAt: -1 })
    .toArray()

  return finalTasks
}

/**
 * Aggregate results from completed specialist tasks
 */
export const aggregateResults = (tasks: Task[]): string => {
  const completedTasks = tasks.filter((t) => t.status === 'completed' && t.result)

  if (completedTasks.length === 0) {
    return ''
  }

  const sections = completedTasks.map((task) => {
    return `## ${task.title}\n\n${task.result}`
  })

  return sections.join('\n\n---\n\n')
}

// ============================================================
// DIRECTOR EXECUTION
// ============================================================

/**
 * Run the Director agent with a high-level task
 */
export const runDirector = async (
  context: DirectorContext,
  task: string
): Promise<string> => {
  const runner = createClaudeRunner()

  // Update status to working
  await updateAgentStatus(context.agent.agentId, 'working')

  // Build context packet
  const contextPacket = await buildContextPacket({
    agentId: context.agent.agentId,
    task,
    includeCheckpoint: !!context.resumeContext,
  })

  console.log(`[Director] Starting task: ${task.slice(0, 50)}...`)

  // Run Claude with director protocol
  const result = await runner.run({
    agentId: context.agent.agentId,
    agentType: 'director',
    task,
    resumeContext: contextPacket.resumeContext ?? undefined,
  })

  // Create checkpoint
  await checkpoint({
    agentId: context.agent.agentId,
    summary: {
      goal: task,
      completed: ['Task analysis', 'Initial response generated'],
      pending: [],
      decisions: [],
    },
    resumePointer: {
      nextAction: 'Review results',
      phase: 'complete',
    },
    tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
  })

  // Update status
  await updateAgentStatus(context.agent.agentId, 'completed')

  console.log(`[Director] Completed task`)

  return result.content
}

/**
 * Decompose a task into subtasks for specialists
 */
export const decomposeTask = async (
  context: DirectorContext,
  task: string
): Promise<TaskAssignment[]> => {
  const runner = createClaudeRunner()

  const prompt = `Analyze this task and break it down into 2-3 subtasks that can be assigned to specialist agents.

Task: ${task}

For each subtask, provide:
1. A clear title
2. A detailed description of what needs to be done

Format your response as JSON array:
[
  {"title": "Subtask 1 Title", "description": "Detailed description..."},
  {"title": "Subtask 2 Title", "description": "Detailed description..."}
]

Only output the JSON array, nothing else.`

  const result = await runner.run({
    agentId: context.agent.agentId,
    agentType: 'director',
    task: prompt,
  })

  try {
    // Parse JSON from response
    const subtasks = JSON.parse(result.content) as TaskAssignment[]
    return subtasks
  } catch (error) {
    console.error('[Director] Failed to parse subtasks:', error)
    // Return single task if parsing fails
    return [{ title: 'Complete task', description: task }]
  }
}

/**
 * Full orchestration flow: decompose → spawn → assign → wait → aggregate
 */
export const orchestrate = async (
  context: DirectorContext,
  task: string
): Promise<string> => {
  console.log(`[Director] Starting orchestration for: ${task.slice(0, 50)}...`)

  // Update status
  await updateAgentStatus(context.agent.agentId, 'working')

  // Step 1: Decompose task
  const subtasks = await decomposeTask(context, task)
  console.log(`[Director] Decomposed into ${subtasks.length} subtasks`)

  // Step 2: Spawn specialists and assign tasks
  const specialists: SpecialistContext[] = []
  for (const subtask of subtasks) {
    // Determine specialization based on subtask
    const specialization = determineSpecialization(subtask.title)
    const specialist = await spawnSpecialist(context.agent.agentId, specialization)
    specialists.push(specialist)

    // Assign task
    await assignTaskToSpecialist(
      context.agent.agentId,
      specialist.agent.agentId,
      subtask
    )
  }

  // Step 3: Wait for specialists
  const specialistIds = specialists.map((s) => s.agent.agentId)
  const results = await waitForSpecialists(specialistIds)

  // Step 4: Aggregate results
  const aggregated = aggregateResults(results)

  // Checkpoint
  await checkpoint({
    agentId: context.agent.agentId,
    summary: {
      goal: task,
      completed: subtasks.map((s) => s.title),
      pending: [],
      decisions: [`Spawned ${specialists.length} specialists`],
    },
    resumePointer: {
      nextAction: 'Report final results',
      phase: 'aggregation',
    },
    tokensUsed: 0,
  })

  // Update status
  await updateAgentStatus(context.agent.agentId, 'completed')

  console.log(`[Director] Orchestration complete`)

  return aggregated
}

/**
 * Determine specialist type based on task title/content
 */
const determineSpecialization = (
  title: string
): 'researcher' | 'writer' | 'analyst' | 'general' => {
  const lower = title.toLowerCase()

  if (lower.includes('research') || lower.includes('find') || lower.includes('discover')) {
    return 'researcher'
  }

  if (lower.includes('write') || lower.includes('document') || lower.includes('draft')) {
    return 'writer'
  }

  if (lower.includes('analyze') || lower.includes('review') || lower.includes('evaluate')) {
    return 'analyst'
  }

  return 'general'
}
