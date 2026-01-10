import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, existsSync } from 'fs'
import { config } from '../config.js'

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
}

export type RunResult = {
  content: string
  stopReason: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

export type ClaudeRunner = {
  run: (config: RunConfig, onMessage?: (content: string) => void) => Promise<RunResult>
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
  sections.push('- `sendMessage(toAgentId, content, type)` - Send message to another agent')
  sections.push('- `checkpoint(summary, resumePointer)` - Save your state for potential resume')
  sections.push('- `createTask(title, description)` - Create a new work unit')
  sections.push('- `assignTask(taskId, agentId)` - Assign task to a specialist')
  sections.push('- `completeTask(taskId, result)` - Mark task as completed with result')
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
// RUNNER FACTORY
// ============================================================

/**
 * Create Claude SDK runner
 */
export const createClaudeRunner = (): ClaudeRunner => {
  const client = new Anthropic({
    apiKey: config.ANTHROPIC_API_KEY,
  })

  const run = async (
    cfg: RunConfig,
    onMessage?: (content: string) => void
  ): Promise<RunResult> => {
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

    console.log(`[Runner] Running ${cfg.agentType}${cfg.specialization ? `:${cfg.specialization}` : ''} (${cfg.agentId.slice(0, 8)})`)

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
    }
  }

  return { run }
}
