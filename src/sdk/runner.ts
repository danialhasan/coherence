import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, existsSync } from 'fs'
import { config } from '../config.js'
import { sendMessage, getInbox, markAsRead } from '../coordination/messages.js'
import { createCheckpoint, getLatestCheckpoint } from '../coordination/checkpoints.js'
import { createTask, assignTask, completeTask, getTask } from '../coordination/tasks.js'
import { getMessagesCollection, getAgentsCollection } from '../db/mongo.js'

// ============================================================
// CLAUDE SDK RUNNER — Wrapper for Anthropic API calls
// ============================================================

export type AgentType = 'director' | 'specialist'
export type Specialization = 'researcher' | 'writer' | 'analyst' | 'general'

export type RunConfig = {
  agentId: string
  agentType: AgentType
  specialization?: Specialization
  task: string
  resumeContext?: string
  onToolCall?: (toolName: string, input: unknown, result: unknown) => void
  maxTurns?: number
}

export type RunResult = {
  content: string
  stopReason: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  totalTurns: number
  toolCalls: Array<{ name: string; input: unknown; result: unknown }>
}

export type ClaudeRunner = {
  run: (config: RunConfig, onMessage?: (content: string) => void) => Promise<RunResult>
  runAgenticLoop: (config: RunConfig, onMessage?: (content: string) => void) => Promise<RunResult>
}

// ============================================================
// COORDINATION TOOLS SCHEMA (Anthropic format)
// ============================================================

const coordinationTools: Anthropic.Tool[] = [
  {
    name: 'checkInbox',
    description: 'Get unread messages from other agents. Returns array of message previews with IDs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'readMessage',
    description: 'Get the full content of a specific message by ID and mark it as read.',
    input_schema: {
      type: 'object' as const,
      properties: {
        messageId: {
          type: 'string',
          description: 'The UUID of the message to read',
        },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'sendMessage',
    description: 'Send a message to another agent.',
    input_schema: {
      type: 'object' as const,
      properties: {
        toAgentId: {
          type: 'string',
          description: 'UUID of the agent to send message to',
        },
        content: {
          type: 'string',
          description: 'The message content',
        },
        type: {
          type: 'string',
          enum: ['task', 'result', 'status', 'error'],
          description: 'Type of message',
        },
      },
      required: ['toAgentId', 'content', 'type'],
    },
  },
  {
    name: 'checkpoint',
    description: 'Save current state for potential resume. Call this periodically to preserve progress.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: {
          type: 'object',
          description: 'Summary of current state',
          properties: {
            goal: { type: 'string', description: 'Current goal being worked on' },
            completed: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of completed items',
            },
            pending: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of pending items',
            },
            decisions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Key decisions made',
            },
          },
          required: ['goal', 'completed', 'pending', 'decisions'],
        },
        resumePointer: {
          type: 'object',
          description: 'Pointer for resuming work',
          properties: {
            nextAction: { type: 'string', description: 'The next action to take' },
            phase: { type: 'string', description: 'Current phase of work' },
            currentContext: { type: 'string', description: 'Additional context for resume' },
          },
          required: ['nextAction', 'phase'],
        },
      },
      required: ['summary', 'resumePointer'],
    },
  },
  {
    name: 'createTask',
    description: 'Create a new task/work unit.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the task',
        },
        description: {
          type: 'string',
          description: 'Detailed description of what needs to be done',
        },
        parentTaskId: {
          type: 'string',
          description: 'Optional UUID of parent task (for subtasks)',
        },
      },
      required: ['title', 'description'],
    },
  },
  {
    name: 'assignTask',
    description: 'Assign a task to a specialist agent.',
    input_schema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: 'UUID of the task to assign',
        },
        agentId: {
          type: 'string',
          description: 'UUID of the agent to assign the task to',
        },
      },
      required: ['taskId', 'agentId'],
    },
  },
  {
    name: 'completeTask',
    description: 'Mark a task as completed with the result.',
    input_schema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: 'UUID of the task to complete',
        },
        result: {
          type: 'string',
          description: 'The result/output of the completed task',
        },
      },
      required: ['taskId', 'result'],
    },
  },
  {
    name: 'getTaskStatus',
    description: 'Get the current status and details of a task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: 'UUID of the task to check',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'listAgents',
    description: 'List active agents that can be assigned tasks or messaged.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['director', 'specialist'],
          description: 'Filter by agent type',
        },
        status: {
          type: 'string',
          enum: ['idle', 'working', 'waiting'],
          description: 'Filter by agent status',
        },
      },
      required: [],
    },
  },
]

// ============================================================
// TOOL EXECUTOR
// ============================================================

type ToolInput = Record<string, unknown>

/**
 * Execute a single coordination tool and return the result
 */
const executeTool = async (
  toolName: string,
  input: ToolInput,
  agentId: string
): Promise<unknown> => {
  console.log(`[Runner] Executing tool: ${toolName}`, JSON.stringify(input).slice(0, 100))

  switch (toolName) {
    case 'checkInbox': {
      const limit = (input.limit as number) || 10
      const messages = await getInbox(agentId)
      const limitedMessages = messages.slice(0, limit)
      
      // Return lightweight previews (not full content)
      return limitedMessages.map((msg) => ({
        messageId: msg.messageId,
        fromAgent: msg.fromAgent,
        type: msg.type,
        priority: msg.priority,
        preview: msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : ''),  // 50 chars per spec
        createdAt: msg.createdAt,
      }))
    }

    case 'readMessage': {
      const messageId = input.messageId as string
      const messages = await getMessagesCollection()
      const message = await messages.findOne({ messageId })
      
      if (!message) {
        return { error: `Message ${messageId} not found` }
      }
      
      // Mark as read
      await markAsRead(messageId)
      
      return {
        messageId: message.messageId,
        fromAgent: message.fromAgent,
        content: message.content,
        type: message.type,
        threadId: message.threadId,
        createdAt: message.createdAt,
      }
    }

    case 'sendMessage': {
      const message = await sendMessage({
        fromAgent: agentId,
        toAgent: input.toAgentId as string,
        content: input.content as string,
        type: input.type as 'task' | 'result' | 'status' | 'error',
      })
      
      return {
        success: true,
        messageId: message.messageId,
        threadId: message.threadId,
      }
    }

    case 'checkpoint': {
      const summary = input.summary as {
        goal: string
        completed: string[]
        pending: string[]
        decisions: string[]
      }
      const resumePointer = input.resumePointer as {
        nextAction: string
        phase: string
        currentContext?: string
      }
      
      const checkpoint = await createCheckpoint({
        agentId,
        summary,
        resumePointer,
        tokensUsed: 0, // Will be updated by caller
      })
      
      return {
        success: true,
        checkpointId: checkpoint.checkpointId,
        phase: resumePointer.phase,
      }
    }

    case 'createTask': {
      const task = await createTask({
        title: input.title as string,
        description: input.description as string,
        parentTaskId: input.parentTaskId as string | undefined,
      })
      
      return {
        success: true,
        taskId: task.taskId,
        title: task.title,
        status: task.status,
      }
    }

    case 'assignTask': {
      await assignTask(
        input.taskId as string,
        input.agentId as string
      )
      
      return {
        success: true,
        taskId: input.taskId,
        assignedTo: input.agentId,
      }
    }

    case 'completeTask': {
      await completeTask(
        input.taskId as string,
        input.result as string
      )
      
      return {
        success: true,
        taskId: input.taskId,
        status: 'completed',
      }
    }

    case 'getTaskStatus': {
      const task = await getTask(input.taskId as string)
      
      if (!task) {
        return { error: `Task ${input.taskId} not found` }
      }
      
      return {
        taskId: task.taskId,
        title: task.title,
        status: task.status,
        assignedTo: task.assignedTo,
        result: task.result,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      }
    }

    case 'listAgents': {
      const agents = await getAgentsCollection()
      const query: Record<string, unknown> = {
        status: { $in: ['idle', 'working', 'waiting'] },
      }
      
      if (input.type) {
        query.type = input.type
      }
      if (input.status) {
        query.status = input.status
      }
      
      const agentList = await agents.find(query).toArray()
      
      return agentList.map((agent) => ({
        agentId: agent.agentId,
        type: agent.type,
        specialization: agent.specialization,
        status: agent.status,
        lastHeartbeat: agent.lastHeartbeat,
      }))
    }

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

/**
 * Execute all tool calls from a response and return tool results
 */
const executeToolCalls = async (
  content: Anthropic.ContentBlock[],
  agentId: string,
  onToolCall?: (toolName: string, input: unknown, result: unknown) => void
): Promise<{
  toolResults: Anthropic.ToolResultBlockParam[]
  calls: Array<{ name: string; input: unknown; result: unknown }>
}> => {
  const toolResults: Anthropic.ToolResultBlockParam[] = []
  const calls: Array<{ name: string; input: unknown; result: unknown }> = []

  for (const block of content) {
    if (block.type === 'tool_use') {
      const toolUseBlock = block as Anthropic.ToolUseBlock
      
      try {
        const result = await executeTool(
          toolUseBlock.name,
          toolUseBlock.input as ToolInput,
          agentId
        )
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(result),
        })
        
        calls.push({
          name: toolUseBlock.name,
          input: toolUseBlock.input,
          result,
        })
        
        // Callback for WebSocket events
        onToolCall?.(toolUseBlock.name, toolUseBlock.input, result)
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Runner] Tool error (${toolUseBlock.name}):`, errorMessage)
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify({ error: errorMessage }),
          is_error: true,
        })
        
        calls.push({
          name: toolUseBlock.name,
          input: toolUseBlock.input,
          result: { error: errorMessage },
        })
      }
    }
  }

  return { toolResults, calls }
}

// ============================================================
// SKILL CONTENT LOADING
// ============================================================

const SKILLS_BASE_PATH = '.claude/skills'

/**
 * Load skill content from file
 */
export const loadSkillContent = (
  agentType: AgentType,
  specialization?: Specialization
): string => {
  let skillPath: string

  if (agentType === 'director') {
    skillPath = `${SKILLS_BASE_PATH}/director/SKILL.md`
  } else if (specialization && specialization !== 'general') {
    skillPath = `${SKILLS_BASE_PATH}/specialist/${specialization}/SKILL.md`
  } else {
    // General specialist - no specific skill file
    return ''
  }

  if (!existsSync(skillPath)) {
    console.log(`[Runner] Skill file not found: ${skillPath}`)
    return ''
  }

  try {
    return readFileSync(skillPath, 'utf8')
  } catch (error) {
    console.error(`[Runner] Error loading skill: ${skillPath}`, error)
    return ''
  }
}

// ============================================================
// SYSTEM PROMPT BUILDING
// ============================================================

export type SystemPromptInput = {
  agentId: string
  agentType: AgentType
  specialization?: Specialization
  skillContent: string
  resumeContext?: string
}

/**
 * Build system prompt for Claude
 */
export const buildSystemPrompt = (input: SystemPromptInput): string => {
  const sections: string[] = []

  // Skill content first (if any)
  if (input.skillContent) {
    sections.push(input.skillContent)
    sections.push('')
    sections.push('---')
    sections.push('')
  }

  // Agent Identity
  sections.push('## Agent Identity')
  sections.push('')
  sections.push(`- **Agent ID:** ${input.agentId}`)
  sections.push(`- **Type:** ${input.agentType}`)

  if (input.specialization) {
    sections.push(`- **Specialization:** ${input.specialization}`)
  }

  sections.push('')

  // Tools section
  sections.push('## Available Tools')
  sections.push('')
  sections.push('You have access to Squad Lite coordination tools:')
  sections.push('')
  sections.push('- `checkInbox()` - Get unread messages from other agents')
  sections.push('- `readMessage(messageId)` - Get full content of a message')
  sections.push('- `sendMessage(toAgentId, content, type)` - Send message to another agent')
  sections.push('- `checkpoint(summary, resumePointer)` - Save your state for potential resume')
  sections.push('- `createTask(title, description)` - Create a new work unit')
  sections.push('- `assignTask(taskId, agentId)` - Assign task to a specialist')
  sections.push('- `completeTask(taskId, result)` - Mark task as completed with result')
  sections.push('- `getTaskStatus(taskId)` - Check task status')
  sections.push('- `listAgents(type?, status?)` - List available agents')
  sections.push('')

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

// ============================================================
// SESSION TRACKING (S7a)
// ============================================================

/**
 * Get or create a session ID for an agent
 * Session IDs persist across agent runs for resume support
 */
export const getOrCreateSessionId = async (agentId: string): Promise<string> => {
  const agents = await getAgentsCollection()
  const agent = await agents.findOne({ agentId })

  if (agent?.sessionId) {
    console.log(`[Runner] Using existing session: ${agent.sessionId.slice(0, 16)}...`)
    return agent.sessionId
  }

  // Generate new session ID with timestamp for debugging
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  await agents.updateOne(
    { agentId },
    { $set: { sessionId } }
  )

  console.log(`[Runner] Created new session: ${sessionId.slice(0, 16)}...`)
  return sessionId
}

/**
 * Update agent's token usage after API call
 * Tracks actual tokens from Claude API response
 */
export const updateAgentTokens = async (
  agentId: string,
  usage: { inputTokens: number; outputTokens: number }
): Promise<void> => {
  const agents = await getAgentsCollection()

  await agents.updateOne(
    { agentId },
    {
      $inc: {
        'tokenUsage.totalInputTokens': usage.inputTokens,
        'tokenUsage.totalOutputTokens': usage.outputTokens,
      },
      $set: {
        'tokenUsage.lastUpdated': new Date(),
      },
    },
    { upsert: false }
  )

  console.log(`[Runner] Updated token usage for ${agentId.slice(0, 8)}: +${usage.inputTokens} in / +${usage.outputTokens} out`)
}

/**
 * Initialize token tracking for a new agent
 * Sets up the tokenUsage object with zero values
 */
export const initializeAgentTokens = async (agentId: string): Promise<void> => {
  const agents = await getAgentsCollection()

  await agents.updateOne(
    { agentId },
    {
      $setOnInsert: {
        'tokenUsage.totalInputTokens': 0,
        'tokenUsage.totalOutputTokens': 0,
      },
    }
  )
}

/**
 * Get total tokens used by an agent
 */
export const getAgentTokenUsage = async (agentId: string): Promise<{
  totalInputTokens: number
  totalOutputTokens: number
  lastUpdated: Date | null
}> => {
  const agents = await getAgentsCollection()
  const agent = await agents.findOne({ agentId })

  return {
    totalInputTokens: agent?.tokenUsage?.totalInputTokens ?? 0,
    totalOutputTokens: agent?.tokenUsage?.totalOutputTokens ?? 0,
    lastUpdated: agent?.tokenUsage?.lastUpdated ?? null,
  }
}

// ============================================================
// RUNNER FACTORY
// ============================================================

const MAX_TURNS_DEFAULT = 50

/**
 * Create Claude SDK runner with agentic loop support
 */
export const createClaudeRunner = (): ClaudeRunner => {
  const client = new Anthropic({
    apiKey: config.ANTHROPIC_API_KEY,
  })

  /**
   * Single-turn run (original behavior, for backwards compatibility)
   */
  const run = async (
    cfg: RunConfig,
    onMessage?: (content: string) => void
  ): Promise<RunResult> => {
    // Get or create session ID for this agent (S7a: Session Tracking)
    const sessionId = await getOrCreateSessionId(cfg.agentId)

    // Load skill content
    const skillContent = loadSkillContent(cfg.agentType, cfg.specialization)

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      agentId: cfg.agentId,
      agentType: cfg.agentType,
      specialization: cfg.specialization,
      skillContent,
      resumeContext: cfg.resumeContext,
    })

    console.log(`[Runner] Running ${cfg.agentType}${cfg.specialization ? `:${cfg.specialization}` : ''} (${cfg.agentId.slice(0, 8)}) [session: ${sessionId.slice(0, 16)}...]`)

    // Call Claude API
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: cfg.task,
        },
      ],
    })

    // Track actual token usage (S7a: Token Tracking)
    await updateAgentTokens(cfg.agentId, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    })

    // Extract text content
    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    // Call callback if provided
    if (onMessage) {
      onMessage(content)
    }

    console.log(`[Runner] Completed (${response.usage.input_tokens} in / ${response.usage.output_tokens} out)`)

    return {
      content,
      stopReason: response.stop_reason ?? 'unknown',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      totalTurns: 1,
      toolCalls: [],
    }
  }

  /**
   * Multi-turn agentic loop with tool_use handling
   */
  const runAgenticLoop = async (
    cfg: RunConfig,
    onMessage?: (content: string) => void
  ): Promise<RunResult> => {
    // Get or create session ID for this agent (S7a: Session Tracking)
    const sessionId = await getOrCreateSessionId(cfg.agentId)

    // Load skill content
    const skillContent = loadSkillContent(cfg.agentType, cfg.specialization)

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      agentId: cfg.agentId,
      agentType: cfg.agentType,
      specialization: cfg.specialization,
      skillContent,
      resumeContext: cfg.resumeContext,
    })

    const maxTurns = cfg.maxTurns ?? MAX_TURNS_DEFAULT
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: cfg.task }]

    let totalInputTokens = 0
    let totalOutputTokens = 0
    let turns = 0
    let finalContent = ''
    let lastStopReason = 'end_turn'  // Track stop reason across loop iterations
    const allToolCalls: Array<{ name: string; input: unknown; result: unknown }> = []

    console.log(`[Runner] Starting agentic loop for ${cfg.agentType}${cfg.specialization ? `:${cfg.specialization}` : ''} (${cfg.agentId.slice(0, 8)}) [session: ${sessionId.slice(0, 16)}...]`)

    while (turns < maxTurns) {
      turns++
      console.log(`[Runner] Turn ${turns}/${maxTurns}`)

      // Call Claude API with tools
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        messages,
        tools: coordinationTools,
      })

      totalInputTokens += response.usage.input_tokens
      totalOutputTokens += response.usage.output_tokens

      // Track actual token usage per turn (S7a: Token Tracking)
      await updateAgentTokens(cfg.agentId, {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      })

      // Extract any text content from this turn
      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      if (textContent) {
        finalContent = textContent // Keep last text as final output
        onMessage?.(textContent)
      }

      // Update the tracked stop reason from this response
      lastStopReason = response.stop_reason ?? 'end_turn'

      if (response.stop_reason === 'end_turn') {
        console.log(`[Runner] Agentic loop completed after ${turns} turns (end_turn)`)
        break
      }

      if (response.stop_reason === 'max_tokens') {
        console.log(`[Runner] Agentic loop stopped: max_tokens reached`)
        break
      }

      if (response.stop_reason === 'tool_use') {
        // Execute tool calls
        const { toolResults, calls } = await executeToolCalls(
          response.content,
          cfg.agentId,
          cfg.onToolCall
        )

        allToolCalls.push(...calls)

        // Append assistant message with content (text + tool_use blocks)
        messages.push({ role: 'assistant', content: response.content })

        // Append tool results
        messages.push({ role: 'user', content: toolResults })

        console.log(`[Runner] Executed ${calls.length} tool(s): ${calls.map((c) => c.name).join(', ')}`)
        // lastStopReason will be updated on next iteration
      } else {
        // Unknown stop reason, break to be safe
        console.log(`[Runner] Unknown stop_reason: ${response.stop_reason}`)
        break
      }
    }

    // Determine final stop reason
    let finalStopReason: string
    if (turns >= maxTurns) {
      console.log(`[Runner] Agentic loop reached max turns (${maxTurns})`)
      finalStopReason = 'max_turns'
    } else {
      // Use actual stop_reason from last response
      finalStopReason = lastStopReason
    }

    console.log(`[Runner] Agentic loop finished: ${turns} turns, ${allToolCalls.length} tool calls, ${totalInputTokens} in / ${totalOutputTokens} out`)

    return {
      content: finalContent,
      stopReason: finalStopReason,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
      totalTurns: turns,
      toolCalls: allToolCalls,
    }
  }

  return { run, runAgenticLoop }
}
