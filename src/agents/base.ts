import { v4 as uuid } from 'uuid'
import { getAgentsCollection, Agent, AgentSchema } from '../db/mongo.js'
import { resumeFromCheckpoint, createCheckpoint, CreateCheckpointInput } from '../coordination/checkpoints.js'
import { getInbox, sendMessage, SendMessageInput, pollInbox } from '../coordination/messages.js'

// ============================================================
// BASE AGENT — Shared functionality for all agent types
// ============================================================

export type AgentConfig = {
  type: 'director' | 'specialist'
  specialization?: 'researcher' | 'writer' | 'analyst' | 'general'
  parentId?: string
}

export type AgentContext = {
  agent: Agent
  resumeContext: string | null
}

/**
 * Register a new agent in MongoDB
 */
export const registerAgent = async (config: AgentConfig): Promise<Agent> => {
  const agents = await getAgentsCollection()

  const agent: Agent = {
    agentId: uuid(),
    type: config.type,
    specialization: config.specialization,
    status: 'idle',
    parentId: config.parentId || null,
    taskId: null,
    createdAt: new Date(),
    lastHeartbeat: new Date(),
  }

  AgentSchema.parse(agent)
  await agents.insertOne(agent)

  console.log(`[Agent] Registered ${config.type}${config.specialization ? `:${config.specialization}` : ''} (${agent.agentId.slice(0, 8)})`)

  return agent
}

/**
 * Initialize agent — register and check for existing checkpoint
 */
export const initializeAgent = async (config: AgentConfig): Promise<AgentContext> => {
  const agent = await registerAgent(config)

  // Check if there's a checkpoint to resume from
  const { resumeContext } = await resumeFromCheckpoint(agent.agentId)

  return {
    agent,
    resumeContext,
  }
}

/**
 * Update agent status
 */
export const updateAgentStatus = async (
  agentId: string,
  status: Agent['status'],
  taskId?: string
): Promise<void> => {
  const agents = await getAgentsCollection()

  await agents.updateOne(
    { agentId },
    {
      $set: {
        status,
        taskId: taskId || null,
        lastHeartbeat: new Date(),
      },
    }
  )
}

/**
 * Heartbeat — update lastHeartbeat to indicate agent is alive
 */
export const heartbeat = async (agentId: string): Promise<void> => {
  const agents = await getAgentsCollection()
  await agents.updateOne(
    { agentId },
    { $set: { lastHeartbeat: new Date() } }
  )
}

/**
 * Checkpoint — save agent state for resume
 */
export const checkpoint = async (input: CreateCheckpointInput): Promise<void> => {
  await createCheckpoint(input)
}

/**
 * Send message wrapper for agents
 */
export const send = async (input: SendMessageInput): Promise<void> => {
  await sendMessage(input)
}

/**
 * Receive messages wrapper for agents
 */
export const receive = async (agentId: string): Promise<ReturnType<typeof getInbox>> => {
  return getInbox(agentId)
}

/**
 * Wait for message (blocking poll)
 */
export const waitForMessage = async (
  agentId: string,
  timeoutMs?: number
): Promise<ReturnType<typeof pollInbox>> => {
  return pollInbox(agentId, timeoutMs)
}

/**
 * Graceful shutdown
 */
export const shutdownAgent = async (agentId: string): Promise<void> => {
  await updateAgentStatus(agentId, 'completed')
  console.log(`[Agent] ${agentId.slice(0, 8)} shutdown complete`)
}
