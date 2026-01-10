import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'

// ============================================================
// MOCK SETUP
// ============================================================

const { mockAnthropicCreate, mockMessagesCollection, mockAgentsCollection, mockSendMessage, mockGetInbox, mockMarkAsRead, mockCreateCheckpoint, mockCreateTask, mockAssignTask, mockCompleteTask, mockGetTask } = vi.hoisted(() => {
  const mockAnthropicCreate = vi.fn()
  const mockMessagesCollection = {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    findOne: vi.fn().mockResolvedValue(null),
  }
  const mockAgentsCollection = {
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
    findOne: vi.fn().mockResolvedValue(null), // For session tracking
    updateOne: vi.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 }), // For token/session updates
  }
  const mockSendMessage = vi.fn().mockResolvedValue({
    messageId: 'msg-123',
    threadId: 'thread-123',
  })
  const mockGetInbox = vi.fn().mockResolvedValue([])
  const mockMarkAsRead = vi.fn().mockResolvedValue(undefined)
  const mockCreateCheckpoint = vi.fn().mockResolvedValue({
    checkpointId: 'chk-123',
  })
  const mockCreateTask = vi.fn().mockResolvedValue({
    taskId: 'task-123',
    title: 'Test Task',
    status: 'pending',
  })
  const mockAssignTask = vi.fn().mockResolvedValue(undefined)
  const mockCompleteTask = vi.fn().mockResolvedValue(undefined)
  const mockGetTask = vi.fn().mockResolvedValue({
    taskId: 'task-123',
    title: 'Test Task',
    status: 'pending',
    assignedTo: null,
    result: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return {
    mockAnthropicCreate,
    mockMessagesCollection,
    mockAgentsCollection,
    mockSendMessage,
    mockGetInbox,
    mockMarkAsRead,
    mockCreateCheckpoint,
    mockCreateTask,
    mockAssignTask,
    mockCompleteTask,
    mockGetTask,
  }
})

vi.mock('@anthropic-ai/sdk', () => {
  // Create a mock class that can be instantiated with `new`
  const MockAnthropic = function(this: any) {
    this.messages = {
      create: mockAnthropicCreate,
    }
  } as unknown as { new(): any }

  return {
    default: MockAnthropic,
  }
})

vi.mock('../config.js', () => ({
  config: {
    ANTHROPIC_API_KEY: 'sk-ant-mock-api-key-for-testing',
    NODE_ENV: 'test',
  },
}))

vi.mock('../db/mongo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/mongo.js')>()
  return {
    ...actual,
    getMessagesCollection: vi.fn().mockResolvedValue(mockMessagesCollection),
    getAgentsCollection: vi.fn().mockResolvedValue(mockAgentsCollection),
  }
})

vi.mock('../coordination/messages.js', () => ({
  sendMessage: mockSendMessage,
  getInbox: mockGetInbox,
  markAsRead: mockMarkAsRead,
}))

vi.mock('../coordination/checkpoints.js', () => ({
  createCheckpoint: mockCreateCheckpoint,
  getLatestCheckpoint: vi.fn().mockResolvedValue(null),
}))

vi.mock('../coordination/tasks.js', () => ({
  createTask: mockCreateTask,
  assignTask: mockAssignTask,
  completeTask: mockCompleteTask,
  getTask: mockGetTask,
}))

// Mock fs for skill loading
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    readFileSync: vi.fn().mockImplementation((path: string) => {
      if (path.includes('director')) {
        return '# Director Protocol\n\nYou are a director agent.\n'
      }
      if (path.includes('researcher')) {
        return '# Researcher Protocol\n\nYou are a research specialist.\n'
      }
      if (path.includes('writer')) {
        return '# Writer Protocol\n\nYou are a writing specialist.\n'
      }
      if (path.includes('analyst')) {
        return '# Analyst Protocol\n\nYou are an analysis specialist.\n'
      }
      throw new Error(`ENOENT: no such file or directory, open '${path}'`)
    }),
    existsSync: vi.fn().mockImplementation((path: string) => {
      return path.includes('director') ||
             path.includes('researcher') ||
             path.includes('writer') ||
             path.includes('analyst')
    }),
  }
})

// Import after mocks
import {
  createClaudeRunner,
  loadSkillContent,
  buildSystemPrompt,
} from '../sdk/runner.js'

// ============================================================
// SDK RUNNER UNIT TESTS
// ============================================================

describe('SDK Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock response
    mockAnthropicCreate.mockResolvedValue({
      id: 'msg-123',
      content: [
        { type: 'text', text: 'I will help you with that task.' },
      ],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
      },
    })
  })

  // ============================================================
  // CREATE RUNNER
  // ============================================================

  describe('createClaudeRunner()', () => {
    it('creates runner with run and runAgenticLoop methods', () => {
      const runner = createClaudeRunner()

      expect(runner).toBeDefined()
      expect(runner.run).toBeDefined()
      expect(runner.runAgenticLoop).toBeDefined()
      expect(typeof runner.run).toBe('function')
      expect(typeof runner.runAgenticLoop).toBe('function')
    })
  })

  // ============================================================
  // LOAD SKILL CONTENT
  // ============================================================

  describe('loadSkillContent()', () => {
    it('loads director skill content', () => {
      const content = loadSkillContent('director')

      expect(content).toContain('Director')
      expect(content).toContain('director')
    })

    it('loads specialist skill by specialization', () => {
      const content = loadSkillContent('specialist', 'researcher')

      expect(content).toContain('Researcher')
      expect(content).toContain('research')
    })

    it('returns empty string for unknown specialization', () => {
      const content = loadSkillContent('specialist', 'unknown' as any)

      expect(content).toBe('')
    })

    it('returns empty string for general specialist (no skill file)', () => {
      // General specialists don't have a specific skill file
      const content = loadSkillContent('specialist', 'general')

      expect(content).toBe('')
    })
  })

  // ============================================================
  // BUILD SYSTEM PROMPT
  // ============================================================

  describe('buildSystemPrompt()', () => {
    it('builds prompt with agent identity', () => {
      const prompt = buildSystemPrompt({
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        agentType: 'director',
        skillContent: '# Director Protocol',
      })

      expect(prompt).toContain('550e8400')
      expect(prompt).toContain('director')
      expect(prompt).toContain('Director Protocol')
    })

    it('includes specialization for specialist', () => {
      const prompt = buildSystemPrompt({
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        agentType: 'specialist',
        specialization: 'researcher',
        skillContent: '# Researcher Protocol',
      })

      expect(prompt).toContain('specialist')
      expect(prompt).toContain('researcher')
    })

    it('includes resume context when provided', () => {
      const prompt = buildSystemPrompt({
        agentId: '550e8400-e29b-41d4-a716-446655440002',
        agentType: 'director',
        skillContent: '# Director Protocol',
        resumeContext: 'Previously completed: task analysis',
      })

      expect(prompt).toContain('Previously completed')
      expect(prompt).toContain('Resuming')
    })

    it('includes tool documentation', () => {
      const prompt = buildSystemPrompt({
        agentId: '550e8400-e29b-41d4-a716-446655440003',
        agentType: 'director',
        skillContent: '',
      })

      expect(prompt).toContain('checkInbox')
      expect(prompt).toContain('sendMessage')
      expect(prompt).toContain('checkpoint')
      expect(prompt).toContain('readMessage')
      expect(prompt).toContain('getTaskStatus')
      expect(prompt).toContain('listAgents')
    })
  })

  // ============================================================
  // RUN (single-turn)
  // ============================================================

  describe('run()', () => {
    it('calls Claude API with correct parameters', async () => {
      const runner = createClaudeRunner()

      await runner.run({
        agentId: '550e8400-e29b-41d4-a716-446655440004',
        agentType: 'director',
        task: 'Research MongoDB patterns',
      })

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          max_tokens: expect.any(Number),
          system: expect.any(String),
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Research MongoDB patterns'),
            }),
          ]),
        })
      )
    })

    it('returns response with content, usage, and turn info', async () => {
      const runner = createClaudeRunner()

      const result = await runner.run({
        agentId: '550e8400-e29b-41d4-a716-446655440005',
        agentType: 'director',
        task: 'Simple task',
      })

      expect(result.content).toBe('I will help you with that task.')
      expect(result.stopReason).toBe('end_turn')
      expect(result.usage.inputTokens).toBe(100)
      expect(result.usage.outputTokens).toBe(50)
      expect(result.totalTurns).toBe(1)
      expect(result.toolCalls).toEqual([])
    })

    it('includes resume context in messages when provided', async () => {
      const runner = createClaudeRunner()

      await runner.run({
        agentId: '550e8400-e29b-41d4-a716-446655440006',
        agentType: 'specialist',
        specialization: 'writer',
        task: 'Continue documentation',
        resumeContext: 'Previously wrote introduction',
      })

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('Previously wrote introduction'),
        })
      )
    })

    it('calls onMessage callback with response', async () => {
      const runner = createClaudeRunner()
      const onMessage = vi.fn()

      await runner.run({
        agentId: '550e8400-e29b-41d4-a716-446655440007',
        agentType: 'director',
        task: 'Test task',
      }, onMessage)

      expect(onMessage).toHaveBeenCalledWith('I will help you with that task.')
    })

    it('handles multiple text blocks in response', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg-456',
        content: [
          { type: 'text', text: 'First part. ' },
          { type: 'text', text: 'Second part.' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 25 },
      })

      const runner = createClaudeRunner()

      const result = await runner.run({
        agentId: '550e8400-e29b-41d4-a716-446655440008',
        agentType: 'director',
        task: 'Multi-part response task',
      })

      expect(result.content).toBe('First part. Second part.')
    })

    it('filters out non-text content blocks', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg-789',
        content: [
          { type: 'text', text: 'Text response' },
          { type: 'tool_use', id: 'tool-1', name: 'test', input: {} },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 75, output_tokens: 35 },
      })

      const runner = createClaudeRunner()

      const result = await runner.run({
        agentId: '550e8400-e29b-41d4-a716-446655440009',
        agentType: 'director',
        task: 'Task with tools',
      })

      expect(result.content).toBe('Text response')
      expect(result.stopReason).toBe('tool_use')
    })
  })

  // ============================================================
  // RUN AGENTIC LOOP (multi-turn)
  // ============================================================

  describe('runAgenticLoop()', () => {
    it('completes in single turn when no tools are called', async () => {
      const runner = createClaudeRunner()

      const result = await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440010',
        agentType: 'director',
        task: 'Simple task without tools',
      })

      expect(result.content).toBe('I will help you with that task.')
      expect(result.stopReason).toBe('end_turn')
      expect(result.totalTurns).toBe(1)
      expect(result.toolCalls).toEqual([])
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
    })

    it('passes tools to Claude API', async () => {
      const runner = createClaudeRunner()

      await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440011',
        agentType: 'director',
        task: 'Task that might use tools',
      })

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'checkInbox' }),
            expect.objectContaining({ name: 'sendMessage' }),
            expect.objectContaining({ name: 'checkpoint' }),
            expect.objectContaining({ name: 'createTask' }),
            expect.objectContaining({ name: 'assignTask' }),
            expect.objectContaining({ name: 'completeTask' }),
          ]),
        })
      )
    })

    it('handles tool_use response and continues loop', async () => {
      // First call returns tool_use
      mockAnthropicCreate
        .mockResolvedValueOnce({
          id: 'msg-1',
          content: [
            { type: 'text', text: 'Let me check my inbox.' },
            { type: 'tool_use', id: 'tool-1', name: 'checkInbox', input: { limit: 5 } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        // Second call returns end_turn
        .mockResolvedValueOnce({
          id: 'msg-2',
          content: [
            { type: 'text', text: 'No messages in inbox. Task complete.' },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 150, output_tokens: 30 },
        })

      const runner = createClaudeRunner()

      const result = await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440012',
        agentType: 'director',
        task: 'Check inbox and report',
      })

      expect(result.totalTurns).toBe(2)
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].name).toBe('checkInbox')
      expect(result.content).toBe('No messages in inbox. Task complete.')
      expect(result.usage.inputTokens).toBe(250)
      expect(result.usage.outputTokens).toBe(80)
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2)
      expect(mockGetInbox).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440012')
    })

    it('executes sendMessage tool correctly', async () => {
      mockAnthropicCreate
        .mockResolvedValueOnce({
          id: 'msg-1',
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'sendMessage', input: {
              toAgentId: 'agent-456',
              content: 'Hello specialist!',
              type: 'task',
            } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockResolvedValueOnce({
          id: 'msg-2',
          content: [{ type: 'text', text: 'Message sent.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 150, output_tokens: 30 },
        })

      const runner = createClaudeRunner()

      const result = await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440013',
        agentType: 'director',
        task: 'Send a task to specialist',
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        fromAgent: '550e8400-e29b-41d4-a716-446655440013',
        toAgent: 'agent-456',
        content: 'Hello specialist!',
        type: 'task',
      })
      expect(result.toolCalls[0].name).toBe('sendMessage')
    })

    it('executes checkpoint tool correctly', async () => {
      mockAnthropicCreate
        .mockResolvedValueOnce({
          id: 'msg-1',
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'checkpoint', input: {
              summary: {
                goal: 'Research MongoDB',
                completed: ['Found docs'],
                pending: ['Synthesize'],
                decisions: ['Use Atlas'],
              },
              resumePointer: {
                nextAction: 'Synthesize findings',
                phase: 'RESEARCH',
              },
            } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockResolvedValueOnce({
          id: 'msg-2',
          content: [{ type: 'text', text: 'Checkpoint saved.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 150, output_tokens: 30 },
        })

      const runner = createClaudeRunner()

      await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440014',
        agentType: 'specialist',
        specialization: 'researcher',
        task: 'Research and checkpoint',
      })

      expect(mockCreateCheckpoint).toHaveBeenCalledWith({
        agentId: '550e8400-e29b-41d4-a716-446655440014',
        summary: {
          goal: 'Research MongoDB',
          completed: ['Found docs'],
          pending: ['Synthesize'],
          decisions: ['Use Atlas'],
        },
        resumePointer: {
          nextAction: 'Synthesize findings',
          phase: 'RESEARCH',
        },
        tokensUsed: 0,
      })
    })

    it('executes task management tools correctly', async () => {
      mockAnthropicCreate
        .mockResolvedValueOnce({
          id: 'msg-1',
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'createTask', input: {
              title: 'Research MongoDB',
              description: 'Find patterns for agent coordination',
            } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockResolvedValueOnce({
          id: 'msg-2',
          content: [
            { type: 'tool_use', id: 'tool-2', name: 'assignTask', input: {
              taskId: 'task-123',
              agentId: 'specialist-123',
            } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 150, output_tokens: 40 },
        })
        .mockResolvedValueOnce({
          id: 'msg-3',
          content: [{ type: 'text', text: 'Task created and assigned.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 200, output_tokens: 30 },
        })

      const runner = createClaudeRunner()

      const result = await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440015',
        agentType: 'director',
        task: 'Create and assign a research task',
      })

      expect(mockCreateTask).toHaveBeenCalledWith({
        title: 'Research MongoDB',
        description: 'Find patterns for agent coordination',
      })
      expect(mockAssignTask).toHaveBeenCalledWith('task-123', 'specialist-123')
      expect(result.totalTurns).toBe(3)
      expect(result.toolCalls).toHaveLength(2)
    })

    it('calls onToolCall callback for each tool execution', async () => {
      const onToolCall = vi.fn()

      mockAnthropicCreate
        .mockResolvedValueOnce({
          id: 'msg-1',
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'checkInbox', input: {} },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockResolvedValueOnce({
          id: 'msg-2',
          content: [{ type: 'text', text: 'Done.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 150, output_tokens: 30 },
        })

      const runner = createClaudeRunner()

      await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440016',
        agentType: 'director',
        task: 'Task with callback',
        onToolCall,
      })

      expect(onToolCall).toHaveBeenCalledWith('checkInbox', {}, expect.any(Array))
    })

    it('respects maxTurns limit', async () => {
      // Always return tool_use to force loop continuation
      mockAnthropicCreate.mockResolvedValue({
        id: 'msg-loop',
        content: [
          { type: 'tool_use', id: 'tool-loop', name: 'checkInbox', input: {} },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      const runner = createClaudeRunner()

      const result = await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440017',
        agentType: 'director',
        task: 'Infinite loop task',
        maxTurns: 3,
      })

      expect(result.totalTurns).toBe(3)
      expect(result.stopReason).toBe('max_turns')
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(3)
    })

    it('handles max_tokens stop reason', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg-max',
        content: [
          { type: 'text', text: 'This response was truncated due to' },
        ],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 100, output_tokens: 8192 },
      })

      const runner = createClaudeRunner()

      const result = await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440018',
        agentType: 'director',
        task: 'Task that hits max tokens',
      })

      expect(result.totalTurns).toBe(1)
      expect(result.content).toBe('This response was truncated due to')
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
    })

    it('handles tool execution errors gracefully', async () => {
      mockGetInbox.mockRejectedValueOnce(new Error('MongoDB connection failed'))

      mockAnthropicCreate
        .mockResolvedValueOnce({
          id: 'msg-1',
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'checkInbox', input: {} },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockResolvedValueOnce({
          id: 'msg-2',
          content: [{ type: 'text', text: 'Error handled, continuing.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 150, output_tokens: 30 },
        })

      const runner = createClaudeRunner()

      const result = await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440019',
        agentType: 'director',
        task: 'Task with failing tool',
      })

      expect(result.totalTurns).toBe(2)
      expect(result.toolCalls[0].result).toEqual({ error: 'MongoDB connection failed' })
    })

    it('handles multiple tool calls in single response', async () => {
      mockAnthropicCreate
        .mockResolvedValueOnce({
          id: 'msg-1',
          content: [
            { type: 'text', text: 'Executing multiple tools.' },
            { type: 'tool_use', id: 'tool-1', name: 'checkInbox', input: {} },
            { type: 'tool_use', id: 'tool-2', name: 'listAgents', input: { type: 'specialist' } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 80 },
        })
        .mockResolvedValueOnce({
          id: 'msg-2',
          content: [{ type: 'text', text: 'Tools executed successfully.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 200, output_tokens: 30 },
        })

      const runner = createClaudeRunner()

      const result = await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440020',
        agentType: 'director',
        task: 'Task with multiple parallel tools',
      })

      expect(result.toolCalls).toHaveLength(2)
      expect(result.toolCalls[0].name).toBe('checkInbox')
      expect(result.toolCalls[1].name).toBe('listAgents')
    })

    it('accumulates tokens across all turns', async () => {
      mockAnthropicCreate
        .mockResolvedValueOnce({
          id: 'msg-1',
          content: [{ type: 'tool_use', id: 'tool-1', name: 'checkInbox', input: {} }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockResolvedValueOnce({
          id: 'msg-2',
          content: [{ type: 'tool_use', id: 'tool-2', name: 'checkInbox', input: {} }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 200, output_tokens: 60 },
        })
        .mockResolvedValueOnce({
          id: 'msg-3',
          content: [{ type: 'text', text: 'Done.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 300, output_tokens: 20 },
        })

      const runner = createClaudeRunner()

      const result = await runner.runAgenticLoop({
        agentId: '550e8400-e29b-41d4-a716-446655440021',
        agentType: 'director',
        task: 'Multi-turn token accumulation test',
      })

      expect(result.usage.inputTokens).toBe(600) // 100 + 200 + 300
      expect(result.usage.outputTokens).toBe(130) // 50 + 60 + 20
      expect(result.totalTurns).toBe(3)
    })
  })

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  describe('error handling', () => {
    it('throws on API error', async () => {
      mockAnthropicCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'))

      const runner = createClaudeRunner()

      await expect(
        runner.run({
          agentId: '550e8400-e29b-41d4-a716-446655440010',
          agentType: 'director',
          task: 'Failing task',
        })
      ).rejects.toThrow('API rate limit exceeded')
    })

    it('handles empty response content', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg-empty',
        content: [],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 0 },
      })

      const runner = createClaudeRunner()

      const result = await runner.run({
        agentId: '550e8400-e29b-41d4-a716-446655440011',
        agentType: 'director',
        task: 'Empty response task',
      })

      expect(result.content).toBe('')
    })

    it('throws on API error in agentic loop', async () => {
      mockAnthropicCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'))

      const runner = createClaudeRunner()

      await expect(
        runner.runAgenticLoop({
          agentId: '550e8400-e29b-41d4-a716-446655440022',
          agentType: 'director',
          task: 'Failing agentic task',
        })
      ).rejects.toThrow('API rate limit exceeded')
    })
  })
})
