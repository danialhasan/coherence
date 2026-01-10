import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================
// MOCK SETUP
// ============================================================

const { mockMessagesCollection, mockCheckpointsCollection, mockAgentsCollection } = vi.hoisted(() => {
  const mockMessagesCollection = {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
  }

  const mockCheckpointsCollection = {
    findOne: vi.fn().mockResolvedValue(null),
  }

  const mockAgentsCollection = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  }

  return { mockMessagesCollection, mockCheckpointsCollection, mockAgentsCollection }
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

// Import after mocks
import {
  buildContextPacket,
  getUnreadMessages,
  markMessagesAsRead,
  getResumeContext,
  calculateTokenEstimate,
  createAgentSystemPrompt,
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
  })
})
