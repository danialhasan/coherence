import { v4 as uuid } from 'uuid'
import { getMessagesCollection, Message, MessageSchema } from '../db/mongo.js'

// ============================================================
// MESSAGE BUS — Inter-agent communication via MongoDB
// ============================================================

export type SendMessageInput = {
  fromAgent: string
  toAgent: string
  content: string
  type: 'task' | 'result' | 'status' | 'error'
  threadId?: string
  priority?: 'high' | 'normal' | 'low'
}

/**
 * Send a message to another agent
 */
export const sendMessage = async (input: SendMessageInput): Promise<Message> => {
  const messages = await getMessagesCollection()

  const message: Message = {
    messageId: uuid(),
    fromAgent: input.fromAgent,
    toAgent: input.toAgent,
    content: input.content,
    type: input.type,
    threadId: input.threadId || uuid(),
    priority: input.priority || 'normal',
    readAt: null,
    createdAt: new Date(),
  }

  // Validate with Zod before inserting
  MessageSchema.parse(message)

  await messages.insertOne(message)
  console.log(`[Message] ${input.fromAgent.slice(0, 8)} → ${input.toAgent.slice(0, 8)}: ${input.type}`)

  return message
}

/**
 * Get unread messages for an agent (inbox)
 */
export const getInbox = async (agentId: string): Promise<Message[]> => {
  const messages = await getMessagesCollection()

  return messages
    .find({ toAgent: agentId, readAt: null })
    .sort({ priority: -1, createdAt: 1 }) // High priority first, then FIFO
    .toArray()
}

/**
 * Mark a message as read
 */
export const markAsRead = async (messageId: string): Promise<void> => {
  const messages = await getMessagesCollection()
  await messages.updateOne(
    { messageId },
    { $set: { readAt: new Date() } }
  )
}

/**
 * Get all messages in a thread
 */
export const getThread = async (threadId: string): Promise<Message[]> => {
  const messages = await getMessagesCollection()
  return messages
    .find({ threadId })
    .sort({ createdAt: 1 })
    .toArray()
}

/**
 * Poll for new messages (blocking wait with timeout)
 */
export const pollInbox = async (
  agentId: string,
  timeoutMs: number = 5000
): Promise<Message | null> => {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const inbox = await getInbox(agentId)
    if (inbox.length > 0) {
      const message = inbox[0]
      await markAsRead(message.messageId)
      return message
    }
    // Wait 500ms before polling again
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  return null // Timeout, no messages
}
