import {
  getMessagesCollection,
  getCheckpointsCollection,
  getAgentsCollection,
  Message,
  Checkpoint,
  Agent,
} from '../db/mongo.js'
import { markAsRead } from './messages.js'

// ============================================================
// CONTEXT MANAGEMENT — Build context packets for Claude SDK
// ============================================================

export type AgentType = 'director' | 'specialist'
export type Specialization = 'researcher' | 'writer' | 'analyst' | 'general'

export type ContextPacketInput = {
  agentId: string
  task: string
  includeCheckpoint?: boolean
  maxMessages?: number
}

export type ContextPacket = {
  agentId: string
  agentType: AgentType | null
  specialization?: Specialization
  task: string
  unreadMessages: Message[]
  resumeContext: string | null
  tokenEstimate: number
}

/**
 * Build a context packet for a Claude SDK call
 */
export const buildContextPacket = async (input: ContextPacketInput): Promise<ContextPacket> => {
  const agents = await getAgentsCollection()
  const agent = await agents.findOne({ agentId: input.agentId })

  // Get unread messages
  const unreadMessages = await getUnreadMessages(input.agentId, input.maxMessages ?? 10)

  // Get resume context if requested
  let resumeContext: string | null = null
  if (input.includeCheckpoint) {
    resumeContext = await getResumeContext(input.agentId)
  }

  const packet: ContextPacket = {
    agentId: input.agentId,
    agentType: agent?.type ?? null,
    specialization: agent?.specialization,
    task: input.task,
    unreadMessages,
    resumeContext,
    tokenEstimate: 0,
  }

  // Calculate token estimate
  packet.tokenEstimate = calculateTokenEstimate(JSON.stringify(packet))

  return packet
}

/**
 * Get unread messages for an agent
 */
export const getUnreadMessages = async (
  agentId: string,
  limit: number = 20
): Promise<Message[]> => {
  const messages = await getMessagesCollection()

  return messages
    .find({
      toAgent: agentId,
      readAt: null,
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
}

/**
 * Mark messages as read
 */
export const markMessagesAsRead = async (messageIds: string[]): Promise<void> => {
  if (messageIds.length === 0) return

  const messages = await getMessagesCollection()

  await messages.updateMany(
    { messageId: { $in: messageIds } },
    {
      $set: {
        readAt: new Date(),
      },
    }
  )

  console.log(`[Context] Marked ${messageIds.length} messages as read`)
}

/**
 * Get resume context from latest checkpoint
 */
export const getResumeContext = async (agentId: string): Promise<string | null> => {
  const checkpoints = await getCheckpointsCollection()

  const checkpoint = await checkpoints.findOne(
    { agentId },
    { sort: { createdAt: -1 } }
  )

  if (!checkpoint) {
    return null
  }

  return buildResumeContextString(checkpoint)
}

/**
 * Build resume context string from checkpoint
 */
const buildResumeContextString = (checkpoint: Checkpoint): string => {
  const sections: string[] = []

  sections.push('## Resuming from Checkpoint')
  sections.push('')
  sections.push(`**Goal:** ${checkpoint.summary.goal}`)
  sections.push('')

  if (checkpoint.summary.completed.length > 0) {
    sections.push('**Completed:**')
    checkpoint.summary.completed.forEach((item) => sections.push(`- ${item}`))
    sections.push('')
  }

  if (checkpoint.summary.pending.length > 0) {
    sections.push('**Pending:**')
    checkpoint.summary.pending.forEach((item) => sections.push(`- ${item}`))
    sections.push('')
  }

  if (checkpoint.summary.decisions.length > 0) {
    sections.push('**Key Decisions:**')
    checkpoint.summary.decisions.forEach((item) => sections.push(`- ${item}`))
    sections.push('')
  }

  sections.push(`**Next Action:** ${checkpoint.resumePointer.nextAction}`)
  sections.push(`**Phase:** ${checkpoint.resumePointer.phase}`)

  if (checkpoint.resumePointer.currentContext) {
    sections.push(`**Context:** ${checkpoint.resumePointer.currentContext}`)
  }

  return sections.join('\n')
}

/**
 * Calculate rough token estimate for text
 * Uses ~4 characters per token as rough estimate
 */
export const calculateTokenEstimate = (text: string): number => {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export type SystemPromptInput = {
  agentId: string
  agentType: AgentType
  specialization?: Specialization
  resumeContext?: string
  unreadMessages?: Message[]
}

/**
 * Create system prompt for agent
 */
export const createAgentSystemPrompt = (input: SystemPromptInput): string => {
  const sections: string[] = []

  // Identity section
  sections.push('# Agent Identity')
  sections.push('')
  sections.push(`- **Agent ID:** ${input.agentId}`)
  sections.push(`- **Type:** ${input.agentType}`)

  if (input.specialization) {
    sections.push(`- **Specialization:** ${input.specialization}`)
  }

  sections.push('')

  // Role description
  if (input.agentType === 'director') {
    sections.push('## Role')
    sections.push('')
    sections.push('You are a **Director Agent** responsible for:')
    sections.push('- Decomposing high-level tasks into subtasks')
    sections.push('- Spawning and coordinate specialist agents')
    sections.push('- Aggregating results from specialists')
    sections.push('- Making strategic decisions about task execution')
    sections.push('')
  } else {
    sections.push('## Role')
    sections.push('')
    sections.push(`You are a **Specialist Agent** (${input.specialization || 'general'}) responsible for:`)
    sections.push('- Executing specific tasks assigned by the Director')
    sections.push('- Reporting progress and results')
    sections.push('- Asking for clarification when needed')
    sections.push('')
  }

  // Tools section
  sections.push('## Available Tools')
  sections.push('')
  sections.push('You have access to the following coordination tools:')
  sections.push('')
  sections.push('- `checkInbox()` - Get unread messages from other agents (returns lightweight previews)')
  sections.push('- `readMessage(messageId)` - Get full content of a specific message')
  sections.push('- `sendMessage(toAgentId, content, type)` - Send message to another agent')
  sections.push('- `checkpoint(summary, resumePointer)` - Save your state for potential resume')
  sections.push('- `createTask(title, description)` - Create a new work unit')
  sections.push('- `assignTask(taskId, agentId)` - Assign task to a specialist')
  sections.push('- `completeTask(taskId, result)` - Mark task as completed with result')
  sections.push('')

  // Inbox notifications (S7b: lightweight previews)
  if (input.unreadMessages && input.unreadMessages.length > 0) {
    sections.push('---')
    sections.push('')
    sections.push(buildInboxSection(input.unreadMessages))
    sections.push('')
  }

  // Resume context if provided
  if (input.resumeContext) {
    sections.push('---')
    sections.push('')
    sections.push('## Resuming from Previous Session')
    sections.push('')
    sections.push(input.resumeContext)
  }

  return sections.join('\n')
}

/**
 * Format messages for context injection (FULL content)
 * @deprecated Use formatNotifications() for lightweight previews instead
 */
export const formatMessagesForContext = (messages: Message[]): string => {
  if (messages.length === 0) {
    return 'No unread messages.'
  }

  const formatted = messages.map((msg) => {
    const priority = msg.priority === 'high' ? ' [HIGH PRIORITY]' : ''
    return `- From ${msg.fromAgent.slice(0, 8)}: [${msg.type}]${priority} ${msg.content}`
  })

  return `**Inbox (${messages.length} unread):**\n${formatted.join('\n')}`
}

// ============================================================
// NOTIFICATION INJECTION (S7b) — Lightweight message previews
// ============================================================

const PREVIEW_LENGTH = 50

/**
 * Lightweight notification for a single message
 */
export type MessageNotification = {
  messageId: string
  fromAgent: string
  type: string
  priority: string
  preview: string
  createdAt: Date
}

/**
 * Convert message to lightweight notification (preview only)
 */
export const toNotification = (msg: Message): MessageNotification => {
  const preview =
    msg.content.length > PREVIEW_LENGTH
      ? `${msg.content.slice(0, PREVIEW_LENGTH)}...`
      : msg.content

  return {
    messageId: msg.messageId,
    fromAgent: msg.fromAgent,
    type: msg.type,
    priority: msg.priority,
    preview,
    createdAt: msg.createdAt,
  }
}

/**
 * Format messages as lightweight notifications (S7b pattern)
 * Full content retrieved via readMessage() tool
 *
 * Example output:
 * [MAIL] From: research1 | Type: result | ID: msg-42 [HIGH]
 *   Preview: "Found 3 MongoDB coordination patterns..."
 */
export const formatNotifications = (messages: Message[]): string => {
  if (messages.length === 0) {
    return 'No unread messages.'
  }

  return messages
    .map((msg) => {
      const preview =
        msg.content.length > PREVIEW_LENGTH
          ? `${msg.content.slice(0, PREVIEW_LENGTH)}...`
          : msg.content
      const priority = msg.priority === 'high' ? ' [HIGH]' : ''

      return `[MAIL] From: ${msg.fromAgent.slice(0, 8)} | Type: ${msg.type} | ID: ${msg.messageId}${priority}\n  Preview: "${preview}"`
    })
    .join('\n\n')
}

/**
 * Build inbox section for system prompt using lightweight notifications
 */
export const buildInboxSection = (messages: Message[]): string => {
  const sections: string[] = []

  sections.push(`## Inbox (${messages.length} unread)`)
  sections.push('')

  if (messages.length === 0) {
    sections.push('No unread messages.')
  } else {
    sections.push(formatNotifications(messages))
    sections.push('')
    sections.push('Use `readMessage(messageId)` to get full content of any message.')
  }

  return sections.join('\n')
}

/**
 * Read full message content by ID and mark as read
 * This is the function agents call via the readMessage tool
 */
export const readMessage = async (messageId: string): Promise<Message | null> => {
  const messages = await getMessagesCollection()
  const message = await messages.findOne({ messageId })

  if (message) {
    // Mark as read when fetching full content
    await markAsRead(messageId)
  }

  return message
}

/**
 * Get peer agents for context (other agents in same squad)
 */
export const getPeerAgents = async (agentId: string): Promise<Agent[]> => {
  const agents = await getAgentsCollection()
  const agent = await agents.findOne({ agentId })

  if (!agent) return []

  // Get other agents with same parent or same task
  const query: Record<string, unknown> = {
    agentId: { $ne: agentId },
    status: { $in: ['idle', 'working', 'waiting'] },
  }

  if (agent.parentId) {
    query.parentId = agent.parentId
  } else if (agent.taskId) {
    query.taskId = agent.taskId
  }

  return agents.find(query).toArray()
}
