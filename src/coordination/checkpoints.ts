import { v4 as uuid } from 'uuid'
import { getCheckpointsCollection, Checkpoint, CheckpointSchema } from '../db/mongo.js'

// ============================================================
// CHECKPOINTS — Context persistence for agent resume
// ============================================================

export type CreateCheckpointInput = {
  agentId: string
  summary: {
    goal: string
    completed: string[]
    pending: string[]
    decisions: string[]
  }
  resumePointer: {
    nextAction: string
    currentContext?: string
    phase: string
  }
  tokensUsed: number
}

/**
 * Create a checkpoint for an agent
 */
export const createCheckpoint = async (input: CreateCheckpointInput): Promise<Checkpoint> => {
  const checkpoints = await getCheckpointsCollection()

  const checkpoint: Checkpoint = {
    checkpointId: uuid(),
    agentId: input.agentId,
    summary: input.summary,
    resumePointer: input.resumePointer,
    tokensUsed: input.tokensUsed,
    createdAt: new Date(),
  }

  // Validate with Zod before inserting
  CheckpointSchema.parse(checkpoint)

  await checkpoints.insertOne(checkpoint)
  console.log(`[Checkpoint] Agent ${input.agentId.slice(0, 8)} checkpointed at phase: ${input.resumePointer.phase}`)

  return checkpoint
}

/**
 * Get the latest checkpoint for an agent
 */
export const getLatestCheckpoint = async (agentId: string): Promise<Checkpoint | null> => {
  const checkpoints = await getCheckpointsCollection()

  const checkpoint = await checkpoints.findOne(
    { agentId },
    { sort: { createdAt: -1 } }
  )

  return checkpoint
}

/**
 * Get all checkpoints for an agent (history)
 */
export const getCheckpointHistory = async (agentId: string): Promise<Checkpoint[]> => {
  const checkpoints = await getCheckpointsCollection()

  return checkpoints
    .find({ agentId })
    .sort({ createdAt: -1 })
    .toArray()
}

/**
 * Resume from checkpoint — returns the resume pointer and summary
 */
export const resumeFromCheckpoint = async (agentId: string): Promise<{
  hasCheckpoint: boolean
  checkpoint: Checkpoint | null
  resumeContext: string | null
}> => {
  const checkpoint = await getLatestCheckpoint(agentId)

  if (!checkpoint) {
    return {
      hasCheckpoint: false,
      checkpoint: null,
      resumeContext: null,
    }
  }

  // Build resume context from checkpoint
  const resumeContext = `
## Resuming from Checkpoint

**Goal:** ${checkpoint.summary.goal}

**Completed:**
${checkpoint.summary.completed.map(c => `- ${c}`).join('\n')}

**Pending:**
${checkpoint.summary.pending.map(p => `- ${p}`).join('\n')}

**Key Decisions:**
${checkpoint.summary.decisions.map(d => `- ${d}`).join('\n')}

**Next Action:** ${checkpoint.resumePointer.nextAction}
**Phase:** ${checkpoint.resumePointer.phase}
${checkpoint.resumePointer.currentContext ? `**Context:** ${checkpoint.resumePointer.currentContext}` : ''}
`.trim()

  console.log(`[Checkpoint] Agent ${agentId.slice(0, 8)} resuming from phase: ${checkpoint.resumePointer.phase}`)

  return {
    hasCheckpoint: true,
    checkpoint,
    resumeContext,
  }
}
