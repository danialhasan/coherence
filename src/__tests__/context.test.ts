import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================
// MOCK SETUP
// ============================================================

const { mockMessagesCollection, mockCheckpointsCollection, mockAgentsCollection, mockMarkAsRead } = vi.hoisted(() => {
  const mockMessagesCollection = {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    findOne: vi.fn().mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  }

  const mockMarkAsRead = vi.fn().mockResolvedValue(undefined)

  const mockCheckpointsCollection = {
    findOne: vi.fn().mockResolvedValue(null),
  }

  const mockAgentsCollection = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  }

  return { mockMessagesCollection, mockCheckpointsCollection, mockAgentsCollection, mockMarkAsRead }
})

vi.mock('../db/mongo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/mongo.js')>()
  return {
    ...actual,
    getMessagesCollection: vi.fn().mockResolvedValue(mockMessagesCollection),
    getCheckpointsCollection: vi.fn().mockResolvedValue(mockCheckpointsCollection),
    getAgentsCollection: vi.fn().mockResolvedValue(mockAgentsCollection),
  }
})

vi.mock('../coordination/messages.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../coordination/messages.js')>()
  return {
    ...actual,
    markAsRead: mockMarkAsRead,
  }
})

// Import after mocks
import {
  buildContextPacket,
  getUnreadMessages,
  markMessagesAsRead,
  getResumeContext,
  calculateTokenEstimate,
  createAgentSystemPrompt,
  formatNotifications,
  buildInboxSection,
  toNotification,
  readMessage,
} from '../coordination/context.js'
import type { Message, Checkpoint, Agent } from '../db/mongo.js'

// ============================================================
// CONTEXT MANAGEMENT UNIT TESTS
// ============================================================

describe('Context Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================
  // BUILD CONTEXT PACKET
  // ============================================================

  describe('buildContextPacket()', () => {
    it('builds context packet with agent info', async () => {
      const mockAgent: Agent = {
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'director',
        status: 'working',
        sandboxId: 'sandbox-123',
        sandboxStatus: 'active',
        parentId: null,
        taskId: 'task-123',
        createdAt: new Date(),
        lastHeartbeat: new Date(),
      }
      mockAgentsCollection.findOne.mockResolvedValueOnce(mockAgent)

      const packet = await buildContextPacket({
        agentId: mockAgent.agentId,
        task: 'Research MongoDB patterns',
      })

      expect(packet).toBeDefined()
      expect(packet.agentId).toBe(mockAgent.agentId)
      expect(packet.agentType).toBe('director')
      expect(packet.task).toBe('Research MongoDB patterns')
    })

    it('includes unread messages in context', async () => {
      const agentId = '550e8400-e29b-41d4-a716-446655440001'
      const mockAgent: Agent = {
        agentId,
        type: 'specialist',
        specialization: 'researcher',
        status: 'working',
        sandboxId: null,
        sandboxStatus: 'none',
        parentId: 'parent-123',
        taskId: null,
        createdAt: new Date(),
        lastHeartbeat: new Date(),
      }
      mockAgentsCollection.findOne.mockResolvedValueOnce(mockAgent)

      const mockMessages: Message[] = [
        {
          messageId: 'msg-1',
          fromAgent: 'director-1',
          toAgent: agentId,
          content: 'Please research MongoDB indexing',
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

      const packet = await buildContextPacket({
        agentId,
        task: 'Continue research',
      })

      expect(packet.unreadMessages).toHaveLength(1)
      expect(packet.unreadMessages[0].content).toBe('Please research MongoDB indexing')
    })

    it('includes resume context from checkpoint', async () => {
      const agentId = '550e8400-e29b-41d4-a716-446655440002'
      const mockAgent: Agent = {
        agentId,
        type: 'specialist',
        specialization: 'writer',
        status: 'working',
        sandboxId: null,
        sandboxStatus: 'none',
        parentId: null,
        taskId: null,
        createdAt: new Date(),
        lastHeartbeat: new Date(),
      }
      mockAgentsCollection.findOne.mockResolvedValueOnce(mockAgent)

      const mockCheckpoint: Checkpoint = {
        checkpointId: 'cp-1',
        agentId,
        summary: {
          goal: 'Write documentation',
          completed: ['Outlined sections'],
          pending: ['Write introduction'],
          decisions: ['Use markdown format'],
        },
        resumePointer: {
          nextAction: 'Start writing introduction',
          phase: 'writing',
        },
        tokensUsed: 5000,
        createdAt: new Date(),
      }
      mockCheckpointsCollection.findOne.mockResolvedValueOnce(mockCheckpoint)

      const packet = await buildContextPacket({
        agentId,
        task: 'Continue documentation',
        includeCheckpoint: true,
      })

      expect(packet.resumeContext).toBeDefined()
      expect(packet.resumeContext).toContain('Write documentation')
      expect(packet.resumeContext).toContain('writing')
    })

    it('returns null agent info when agent not found', async () => {
      mockAgentsCollection.findOne.mockResolvedValueOnce(null)

      const packet = await buildContextPacket({
        agentId: 'non-existent',
        task: 'Some task',
      })

      expect(packet.agentType).toBeNull()
    })
  })

  // ============================================================
  // GET UNREAD MESSAGES
  // ============================================================

  describe('getUnreadMessages()', () => {
    it('returns unread messages for agent', async () => {
      const agentId = '550e8400-e29b-41d4-a716-446655440003'
      const mockMessages: Message[] = [
        {
          messageId: 'msg-1',
          fromAgent: 'director-1',
          toAgent: agentId,
          content: 'Task assigned',
          type: 'task',
          threadId: 'thread-1',
          priority: 'normal',
          readAt: null,
          createdAt: new Date(),
        },
        {
          messageId: 'msg-2',
          fromAgent: 'specialist-1',
          toAgent: agentId,
          content: 'Status update',
          type: 'status',
          threadId: 'thread-1',
          priority: 'low',
          readAt: null,
          createdAt: new Date(),
        },
      ]

      mockMessagesCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce(mockMessages),
      })

      const messages = await getUnreadMessages(agentId)

      expect(messages).toHaveLength(2)
      expect(mockMessagesCollection.find).toHaveBeenCalledWith({
        toAgent: agentId,
        readAt: null,
      })
    })

    it('respects limit parameter', async () => {
      const agentId = '550e8400-e29b-41d4-a716-446655440004'

      mockMessagesCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce([]),
      })

      await getUnreadMessages(agentId, 5)

      const findResult = mockMessagesCollection.find.mock.results[0].value
      expect(findResult.limit).toHaveBeenCalledWith(5)
    })

    it('returns empty array when no unread messages', async () => {
      mockMessagesCollection.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValueOnce([]),
      })

      const messages = await getUnreadMessages('agent-with-no-messages')

      expect(messages).toHaveLength(0)
    })
  })

  // ============================================================
  // MARK MESSAGES AS READ
  // ============================================================

  describe('markMessagesAsRead()', () => {
    it('marks specific messages as read', async () => {
      const messageIds = ['msg-1', 'msg-2']

      await markMessagesAsRead(messageIds)

      expect(mockMessagesCollection.updateMany).toHaveBeenCalledWith(
        { messageId: { $in: messageIds } },
        expect.objectContaining({
          $set: expect.objectContaining({
            readAt: expect.any(Date),
          }),
        })
      )
    })

    it('handles empty array', async () => {
      await markMessagesAsRead([])

      expect(mockMessagesCollection.updateMany).not.toHaveBeenCalled()
    })
  })

  // ============================================================
  // GET RESUME CONTEXT
  // ============================================================

  describe('getResumeContext()', () => {
    it('builds resume context from checkpoint', async () => {
      const agentId = '550e8400-e29b-41d4-a716-446655440005'
      const mockCheckpoint: Checkpoint = {
        checkpointId: 'cp-1',
        agentId,
        summary: {
          goal: 'Analyze data patterns',
          completed: ['Loaded dataset', 'Cleaned data'],
          pending: ['Run analysis', 'Generate report'],
          decisions: ['Use pandas for analysis'],
        },
        resumePointer: {
          nextAction: 'Run statistical analysis',
          currentContext: 'Data is ready in /tmp/data.csv',
          phase: 'analysis',
        },
        tokensUsed: 3000,
        createdAt: new Date(),
      }
      mockCheckpointsCollection.findOne.mockResolvedValueOnce(mockCheckpoint)

      const context = await getResumeContext(agentId)

      expect(context).not.toBeNull()
      expect(context).toContain('Analyze data patterns')
      expect(context).toContain('Loaded dataset')
      expect(context).toContain('Run analysis')
      expect(context).toContain('Run statistical analysis')
      expect(context).toContain('analysis')
    })

    it('returns null when no checkpoint exists', async () => {
      mockCheckpointsCollection.findOne.mockResolvedValueOnce(null)

      const context = await getResumeContext('agent-without-checkpoint')

      expect(context).toBeNull()
    })
  })

  // ============================================================
  // CALCULATE TOKEN ESTIMATE
  // ============================================================

  describe('calculateTokenEstimate()', () => {
    it('estimates tokens for text content', () => {
      const text = 'This is a sample text that should be around 10 tokens'
      const estimate = calculateTokenEstimate(text)

      // Rough estimate: ~4 chars per token
      expect(estimate).toBeGreaterThan(0)
      expect(estimate).toBeLessThan(100)
    })

    it('estimates tokens for context packet', () => {
      const packet = {
        agentId: '123',
        task: 'Research MongoDB patterns and best practices for multi-agent coordination',
        unreadMessages: [
          { content: 'Please start the research task' },
          { content: 'Focus on coordination patterns' },
        ],
        resumeContext: 'Previously completed: initial research',
      }

      const estimate = calculateTokenEstimate(JSON.stringify(packet))

      expect(estimate).toBeGreaterThan(20)
    })

    it('returns 0 for empty string', () => {
      const estimate = calculateTokenEstimate('')
      expect(estimate).toBe(0)
    })
  })

  // ============================================================
  // CREATE AGENT SYSTEM PROMPT
  // ============================================================

  describe('createAgentSystemPrompt()', () => {
    it('creates system prompt for director', () => {
      const prompt = createAgentSystemPrompt({
        agentId: '550e8400-e29b-41d4-a716-446655440006',
        agentType: 'director',
      })

      expect(prompt).toContain('director')
      expect(prompt).toContain('550e8400')
      expect(prompt).toContain('coordinate')
    })

    it('creates system prompt for specialist with specialization', () => {
      const prompt = createAgentSystemPrompt({
        agentId: '550e8400-e29b-41d4-a716-446655440007',
        agentType: 'specialist',
        specialization: 'researcher',
      })

      expect(prompt).toContain('specialist')
      expect(prompt).toContain('researcher')
    })

    it('includes resume context when provided', () => {
      const prompt = createAgentSystemPrompt({
        agentId: '550e8400-e29b-41d4-a716-446655440008',
        agentType: 'specialist',
        specialization: 'writer',
        resumeContext: 'Previously wrote introduction section',
      })

      expect(prompt).toContain('Previously wrote introduction section')
      expect(prompt).toContain('Resuming')
    })

    it('includes tool documentation', () => {
      const prompt = createAgentSystemPrompt({
        agentId: '550e8400-e29b-41d4-a716-446655440009',
        agentType: 'director',
      })

      expect(prompt).toContain('sendMessage')
      expect(prompt).toContain('checkpoint')
      expect(prompt).toContain('createTask')
    })

    it('includes readMessage tool in documentation', () => {
      const prompt = createAgentSystemPrompt({
        agentId: '550e8400-e29b-41d4-a716-446655440010',
        agentType: 'director',
      })

      expect(prompt).toContain('readMessage')
      expect(prompt).toContain('full content')
    })

    it('includes inbox notifications when unreadMessages provided', () => {
      const mockMessages: Message[] = [
        {
          messageId: 'msg-1',
          fromAgent: 'researcher-001',
          toAgent: 'director-001',
          content: 'Found 3 MongoDB coordination patterns in the documentation',
          type: 'result',
          threadId: 'thread-1',
          priority: 'high',
          readAt: null,
          createdAt: new Date(),
        },
      ]

      const prompt = createAgentSystemPrompt({
        agentId: '550e8400-e29b-41d4-a716-446655440011',
        agentType: 'director',
        unreadMessages: mockMessages,
      })

      expect(prompt).toContain('Inbox (1 unread)')
      expect(prompt).toContain('[MAIL]')
      expect(prompt).toContain('msg-1')
      expect(prompt).toContain('Preview:')
      expect(prompt).toContain('readMessage(messageId)')
    })
  })

  // ============================================================
  // NOTIFICATION INJECTION (S7b)
  // ============================================================

  describe('formatNotifications()', () => {
    it('returns empty message when no messages', () => {
      const result = formatNotifications([])
      expect(result).toBe('No unread messages.')
    })

    it('formats single message as notification', () => {
      const messages: Message[] = [
        {
          messageId: 'msg-123',
          fromAgent: 'researcher-001',
          toAgent: 'director-001',
          content: 'Found 3 sources on MongoDB patterns',
          type: 'result',
          threadId: 'thread-1',
          priority: 'normal',
          readAt: null,
          createdAt: new Date(),
        },
      ]

      const result = formatNotifications(messages)

      expect(result).toContain('[MAIL]')
      expect(result).toContain('From: research')
      expect(result).toContain('Type: result')
      expect(result).toContain('ID: msg-123')
      expect(result).toContain('Preview: "Found 3 sources')
    })

    it('truncates long content to 50 chars', () => {
      const messages: Message[] = [
        {
          messageId: 'msg-456',
          fromAgent: 'writer-001',
          toAgent: 'director-001',
          content: 'This is a very long message that should definitely be truncated to 50 characters for the preview',
          type: 'status',
          threadId: 'thread-1',
          priority: 'normal',
          readAt: null,
          createdAt: new Date(),
        },
      ]

      const result = formatNotifications(messages)

      // The preview should be truncated at 50 chars + "..."
      expect(result).toContain('This is a very long message that should definitely...')
      expect(result).not.toContain('truncated to 50 characters for the preview')
    })

    it('marks high priority messages with [HIGH]', () => {
      const messages: Message[] = [
        {
          messageId: 'msg-789',
          fromAgent: 'director-001',
          toAgent: 'specialist-001',
          content: 'Urgent task',
          type: 'task',
          threadId: 'thread-1',
          priority: 'high',
          readAt: null,
          createdAt: new Date(),
        },
      ]

      const result = formatNotifications(messages)

      expect(result).toContain('[HIGH]')
    })

    it('formats multiple messages separated by double newlines', () => {
      const messages: Message[] = [
        {
          messageId: 'msg-1',
          fromAgent: 'agent-001',
          toAgent: 'agent-002',
          content: 'First message',
          type: 'task',
          threadId: 'thread-1',
          priority: 'normal',
          readAt: null,
          createdAt: new Date(),
        },
        {
          messageId: 'msg-2',
          fromAgent: 'agent-003',
          toAgent: 'agent-002',
          content: 'Second message',
          type: 'result',
          threadId: 'thread-1',
          priority: 'normal',
          readAt: null,
          createdAt: new Date(),
        },
      ]

      const result = formatNotifications(messages)

      expect(result).toContain('msg-1')
      expect(result).toContain('msg-2')
      expect(result.split('\n\n').length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('toNotification()', () => {
    it('converts message to lightweight notification', () => {
      const message: Message = {
        messageId: 'msg-abc',
        fromAgent: 'specialist-researcher-001',
        toAgent: 'director-001',
        content: 'Research complete with findings',
        type: 'result',
        threadId: 'thread-1',
        priority: 'high',
        readAt: null,
        createdAt: new Date('2026-01-10T10:00:00Z'),
      }

      const notification = toNotification(message)

      expect(notification.messageId).toBe('msg-abc')
      expect(notification.fromAgent).toBe('specialist-researcher-001')
      expect(notification.type).toBe('result')
      expect(notification.priority).toBe('high')
      expect(notification.preview).toBe('Research complete with findings')
      expect(notification.createdAt).toEqual(message.createdAt)
    })

    it('truncates preview for long content', () => {
      const message: Message = {
        messageId: 'msg-xyz',
        fromAgent: 'writer-001',
        toAgent: 'director-001',
        content: 'This is a very long message content that exceeds fifty characters limit',
        type: 'status',
        threadId: 'thread-1',
        priority: 'normal',
        readAt: null,
        createdAt: new Date(),
      }

      const notification = toNotification(message)

      // First 50 chars + "..."
      expect(notification.preview).toBe('This is a very long message content that exceeds f...')
      expect(notification.preview.length).toBe(53) // 50 chars + "..."
    })
  })

  describe('buildInboxSection()', () => {
    it('builds inbox section with header and notifications', () => {
      const messages: Message[] = [
        {
          messageId: 'msg-100',
          fromAgent: 'agent-001',
          toAgent: 'agent-002',
          content: 'Test message',
          type: 'task',
          threadId: 'thread-1',
          priority: 'normal',
          readAt: null,
          createdAt: new Date(),
        },
      ]

      const result = buildInboxSection(messages)

      expect(result).toContain('## Inbox (1 unread)')
      expect(result).toContain('[MAIL]')
      expect(result).toContain('readMessage(messageId)')
    })

    it('shows empty inbox message when no messages', () => {
      const result = buildInboxSection([])

      expect(result).toContain('## Inbox (0 unread)')
      expect(result).toContain('No unread messages.')
    })
  })

  describe('readMessage()', () => {
    it('fetches full message and marks as read', async () => {
      const mockMessage: Message = {
        messageId: 'msg-read-1',
        fromAgent: 'researcher-001',
        toAgent: 'director-001',
        content: 'Full message content that was not visible in preview',
        type: 'result',
        threadId: 'thread-1',
        priority: 'normal',
        readAt: null,
        createdAt: new Date(),
      }
      mockMessagesCollection.findOne.mockResolvedValueOnce(mockMessage)

      const result = await readMessage('msg-read-1')

      expect(result).not.toBeNull()
      expect(result?.content).toBe('Full message content that was not visible in preview')
      expect(mockMarkAsRead).toHaveBeenCalledWith('msg-read-1')
    })

    it('returns null for non-existent message', async () => {
      mockMessagesCollection.findOne.mockResolvedValueOnce(null)

      const result = await readMessage('non-existent-msg')

      expect(result).toBeNull()
      expect(mockMarkAsRead).not.toHaveBeenCalled()
    })
  })
})
