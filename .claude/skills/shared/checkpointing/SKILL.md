---
name: checkpoint-protocol
description: Checkpoint and resume protocol. Activates when saving agent state, resuming from a checkpoint, or managing context persistence. All agents must checkpoint regularly.
---

# Checkpoint Protocol v1.0

## Overview

Checkpoints enable agents to survive restarts, crashes, and context window limits. This protocol defines when and how to checkpoint state to MongoDB.

## Core Principles

1. **Checkpoint often**: State is valuable, don't lose progress
2. **Resume seamlessly**: Agent should continue exactly where it left off
3. **Minimal but complete**: Capture enough to resume, not everything
4. **Append-only**: Checkpoints are immutable, create new ones

## Tool Usage

### Create Checkpoint

```
checkpoint(summary, resumePointer, tokensUsed?)
```

**Parameters:**
```json
{
  "summary": {
    "goal": "What the agent is trying to accomplish",
    "completed": ["List of completed items"],
    "pending": ["List of pending items"],
    "decisions": ["Key decisions made"]
  },
  "resumePointer": {
    "nextAction": "Exact next step to take",
    "currentContext": "Optional context string",
    "phase": "Current workflow phase"
  },
  "tokensUsed": 45000
}
```

**Returns:**
```json
{
  "checkpointId": "chk-uuid",
  "agentId": "agent-uuid",
  "createdAt": "2026-01-10T10:30:00Z"
}
```

## When to Checkpoint

### Mandatory Checkpoints

| Trigger | Why |
|---------|-----|
| Phase transition | Capture progress before moving to next phase |
| Task completion | Record what was accomplished |
| Before long operation | In case operation fails |
| Receiving new priority message | Context switch point |
| Every 10 minutes of work | Time-based safety net |

### Optional Checkpoints

| Trigger | Why |
|---------|-----|
| After processing each source (research) | Incremental progress |
| After writing each section (writing) | Don't lose drafted content |
| After analyzing each component (analysis) | Detailed progress |

## Checkpoint Content Guidelines

### Summary.goal
- One sentence describing the overall objective
- Should match the original task assignment
- Example: "Research MongoDB agent coordination patterns"

### Summary.completed
- List of concrete accomplishments
- Use past tense
- Be specific enough to not repeat work
- Example: ["Found 3 official docs", "Analyzed MongoDB change streams"]

### Summary.pending
- List of remaining work items
- Use present tense or infinitive
- Prioritize by importance
- Example: ["Synthesize findings", "Format report"]

### Summary.decisions
- Key decisions that affect future work
- Include rationale if not obvious
- Example: ["Using Atlas Vector Search (better for semantic queries)"]

### ResumePointer.nextAction
- **Most important field**
- Exact instruction for what to do next
- Should be actionable without additional context
- Example: "Call WebFetch on https://docs.mongodb.com/agents to analyze official guide"

### ResumePointer.phase
- Current workflow phase
- Matches phase definitions in agent's protocol skill
- Example: "research", "drafting", "synthesis"

### ResumePointer.currentContext
- Optional additional context
- File being edited, URL being analyzed, etc.
- Example: "Analyzing src/db/mongo.ts for patterns"

## Resume Protocol

When an agent starts/restarts:

```
1. Check for existing checkpoint
   └─ If none: Start fresh

2. Load checkpoint
   └─ Parse summary and resumePointer

3. Reconstruct context
   └─ Build context string from checkpoint

4. Log resume
   └─ "[Agent] Resuming from phase: {phase}"

5. Execute nextAction
   └─ Follow resumePointer.nextAction exactly
```

### Context Reconstruction Template

```markdown
## Resuming from Checkpoint

**Goal:** {summary.goal}

**Completed:**
{for each in summary.completed}
- {item}
{end}

**Pending:**
{for each in summary.pending}
- {item}
{end}

**Key Decisions:**
{for each in summary.decisions}
- {item}
{end}

**Next Action:** {resumePointer.nextAction}
**Phase:** {resumePointer.phase}
```

## Checkpoint Frequency by Phase

| Phase | Checkpoint After |
|-------|------------------|
| Task receipt | Parsing requirements |
| Discovery | Each source found |
| Research/Analysis | Each item processed |
| Drafting | Each section completed |
| Synthesis | Major insights |
| Delivery | Final output |

## Storage

Checkpoints are stored in MongoDB `checkpoints` collection:

```json
{
  "_id": "ObjectId",
  "checkpointId": "chk-uuid",
  "agentId": "agent-uuid",
  "summary": {...},
  "resumePointer": {...},
  "tokensUsed": 45000,
  "createdAt": "2026-01-10T10:30:00Z"
}
```

**Index:** `{ agentId: 1, createdAt: -1 }` for fast latest lookup

## Best Practices

1. **Be specific in nextAction**: "Read file X" not "continue work"
2. **Include file paths**: Reference exact locations
3. **Track tokens**: Helps with context budget
4. **Don't checkpoint too often**: Every action is too much
5. **Don't checkpoint too rarely**: Losing 30min of work hurts
6. **Test resume**: Verify checkpoint enables clean restart

## Anti-Patterns

❌ Vague nextAction: "Continue working"
✅ Specific nextAction: "Analyze source 3 (https://example.com) for authentication patterns"

❌ Missing completed items: []
✅ Detailed completed: ["Analyzed 2 of 5 sources", "Found key pattern in MongoDB docs"]

❌ Checkpoint every tool call
✅ Checkpoint at phase boundaries and time intervals
