import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'

// ============================================================
// MOCK SETUP
// ============================================================

const { mockAnthropicCreate, mockMessagesCollection } = vi.hoisted(() => {
  const mockAnthropicCreate = vi.fn()
  const mockMessagesCollection = {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
  }
  return { mockAnthropicCreate, mockMessagesCollection }
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
  }
})

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
    it('creates runner with run method', () => {
      const runner = createClaudeRunner()

      expect(runner).toBeDefined()
      expect(runner.run).toBeDefined()
      expect(typeof runner.run).toBe('function')
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
    })
  })

  // ============================================================
  // RUN
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

    it('returns response with content and usage', async () => {
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
  })
})
