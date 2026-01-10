# Planning Context — Squad Lite Hackathon

**Source:** Pre-hackathon planning session with Claude Opus 4.5
**Date:** 2026-01-09 → 2026-01-10

---

## Hackathon Constraints (From Hacker Resources)

### Required Theme (Pick ONE)

| Statement | Description | Our Fit |
|-----------|-------------|---------|
| **1. Prolonged Coordination** | Multi-step workflows lasting hours/days, failure recovery | ✅ Checkpoints |
| **2. Multi-Agent Collaboration** | Specialized agents, task assignment, communication | ✅ Director + Specialists |
| **3. Adaptive Retrieval** | Agentic RAG that adapts | ⏸️ Via specialist agents |
| **4. Agentic Payments (x402)** | Agent commerce | ❌ Cutting for time |

### What NOT to Build (Disqualifying)

- Streamlit Applications
- AI Mental Health Advisor
- Trivial RAG Applications
- Basic Image Analyzers
- "AI for Education" Chatbot
- AI Job Application Screener
- AI Nutrition Coach
- Personality Analyzers
- Medical advice AI

### Judging Criteria

| Criterion | Weight |
|-----------|--------|
| **Demo** | **50%** — Must WORK |
| Impact | 25% |
| Creativity | 15% |
| Pitch | 10% |

### Timeline

- 9:00 AM: Doors open
- 10:00 AM: Kickoff
- **5:00 PM: First round judging** (only ~7 hours!)
- 7:00 PM: Finalist demos

---

## Squad Core Systems → Problem Statement Mapping

### Systems We're Porting

| System | Purpose | Statement |
|--------|---------|-----------|
| **Agent Coordination** | Director → Specialist hierarchy | Statement 2 |
| **Message Bus** | Inter-agent communication via MongoDB | Statement 2 |
| **Checkpoints** | Context persistence, resume on restart | Statement 1 |
| **Work Units** | Task decomposition and tracking | Statement 1+2 |

### Systems We're NOT Porting (Time)

- Memory (S1) — Would be nice but complex
- Receipts (S2) — Overkill for demo
- Meta-MCP (S3) — Using direct tool calls
- Observability (S9) — MongoDB Compass is our observability

---

## Architecture Decisions

### Agent Model: Persistent, Not Ephemeral

```
Ephemeral (Task tool): Spawn → Execute → Die
Persistent (Our model): Spawn → Execute → Checkpoint → Resume → Continue
```

**Why persistent:**
- Demonstrates Statement 1 (prolonged coordination)
- Enables the kill/restart demo
- More impressive than one-shot agents

### Scale Limit: Context Window

```
Upper limit = Manager's context window
3 agents: Fine (3 reports fit)
30 agents: Pushing it
300 agents: Would need tiered summarization
```

**For demo:** 3 agents (Director + 2 Specialists)

### Claude Agent SDK

Using official SDK for:
- Agent lifecycle management
- Tool execution
- Context management

---

## Jia's Hackathon Principles (23 Wins)

1. **NEW, original, unique idea** — Not "multi-agent" but "multi-agent that does X specific thing"
2. **High impact + feasibility** — Real problem, solvable in 7 hours
3. **Max 3 features** — Flawlessly delivered
4. **3 sprints:**
   - Sprint 1: Bare minimum of ONE main feature
   - Sprint 2: Integration of other necessary features
   - Sprint 3: Pitch and refinement

---

## Features (Scoped)

### Feature 1: Agent Coordination

**What:** Director spawns Specialists, they communicate via MongoDB

**MongoDB Collections:**
```javascript
// agents
{
  _id: ObjectId,
  agentId: UUID,
  type: "director" | "specialist",
  specialization: "researcher" | "writer" | "analyst",
  status: "idle" | "working" | "waiting" | "completed",
  parentId: UUID | null,  // Director's ID for specialists
  createdAt: Date,
  lastHeartbeat: Date
}

// messages
{
  _id: ObjectId,
  messageId: UUID,
  fromAgent: UUID,
  toAgent: UUID,
  content: string,
  type: "task" | "result" | "status",
  threadId: UUID,
  priority: "high" | "normal" | "low",
  readAt: Date | null,
  createdAt: Date
}
```

### Feature 2: Context Persistence

**What:** Agents checkpoint to MongoDB, resume on restart

**MongoDB Collection:**
```javascript
// checkpoints
{
  _id: ObjectId,
  checkpointId: UUID,
  agentId: UUID,
  summary: {
    goal: string,
    completed: string[],
    pending: string[],
    decisions: string[]
  },
  resumePointer: {
    nextAction: string,
    currentFile: string | null,
    phase: string
  },
  tokensUsed: number,
  createdAt: Date
}
```

---

## Demo Strategy

### Visual Setup (Split Screen)

```
LEFT: Terminal(s) with agents running
RIGHT: MongoDB Compass showing real-time updates
```

### The "Wow" Moment

1. Agents coordinating (messages flowing in Compass)
2. Kill an agent mid-task (Ctrl+C)
3. Show checkpoint exists in MongoDB
4. Restart agent
5. Agent resumes from checkpoint

### Pitch Script (3 min)

> "Traditional AI agents lose context when they restart. Squad Lite solves this.
>
> Watch: A Director agent receives a task and spawns specialists. They coordinate through MongoDB — you can SEE the messages flowing.
>
> Now I kill an agent mid-task... [Ctrl+C]
>
> But look — the checkpoint is in MongoDB. When I restart... [run agent]
>
> It picks up exactly where it left off. This is Statement 1: Prolonged Coordination.
>
> We built this in 5 hours on MongoDB Atlas. The architecture scales to N agents, limited only by context window management."

---

## Open Questions (TBD at Hackathon)

1. **What specific TASK will agents collaborate on?**
   - Research + Brief?
   - Code analysis?
   - Something domain-specific?

2. **Video RAG (Voyager)?**
   - Stretch goal if time permits
   - Would enable multimodal agent capabilities

---

## Pre-Hackathon Checklist

- [x] MongoDB Atlas cluster set up
- [x] Linear project created
- [x] Project scaffold created
- [x] CLAUDE.md written
- [x] Session directory structure
- [ ] Package.json with dependencies
- [ ] Basic agent skeleton code
- [ ] MongoDB connection utility

---

_Planning complete. Ready for hackathon._
