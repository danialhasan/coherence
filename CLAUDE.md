# Squad Lite — MongoDB Agentic Orchestration Hackathon

**Event:** MongoDB Agentic Orchestration & Collaboration Hackathon
**Date:** January 10, 2026
**Location:** Shack15, Ferry Building, SF
**Team:** Danial + Shafan

---

## Project Thesis

**Squad Lite** = Minimal viable multi-agent coordination system built on MongoDB Atlas.

Demonstrates:
1. **Prolonged Coordination** (Statement 1) — Agents checkpoint to MongoDB, survive restarts, resume with state
2. **Multi-Agent Collaboration** (Statement 2) — Director + N Specialists coordinate via MongoDB message bus

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     SQUAD LITE                               │
├─────────────────────────────────────────────────────────────┤
│  Director Agent (Persistent)                                 │
│  ├─ Receives task from human                                │
│  ├─ Decomposes into subtasks                                │
│  ├─ Spawns Specialist agents                                │
│  └─ Aggregates results                                      │
├─────────────────────────────────────────────────────────────┤
│  Specialist Agents (Persistent, N=3 for demo)               │
│  ├─ Receive subtask via MongoDB message                     │
│  ├─ Execute (web search, code analysis, etc.)               │
│  ├─ Checkpoint progress to MongoDB                          │
│  └─ Send results back via MongoDB message                   │
├─────────────────────────────────────────────────────────────┤
│  MongoDB Atlas                                               │
│  ├─ agents: Agent registry & state                          │
│  ├─ messages: Inter-agent communication bus                 │
│  ├─ checkpoints: Context persistence for resume             │
│  └─ tasks: Work unit tracking                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

- **Runtime:** Node.js 20+ / TypeScript
- **Agent SDK:** Claude Agent SDK (@anthropic-ai/agent-sdk)
- **Database:** MongoDB Atlas
- **RAG:** Voyager (video/multimodal RAG) — stretch goal
- **Validation:** Zod
- **Build:** pnpm + tsx

---

## Core Systems (2 Features for Demo)

### Feature 1: Agent Coordination (Statement 2)

**MongoDB Collections:**
- `agents` — Registry of active agents with state
- `messages` — Inter-agent message bus with priority, threading

**Flow:**
1. Director receives task
2. Director creates subtasks in `tasks` collection
3. Director sends messages to Specialists via `messages`
4. Specialists poll inbox, execute, respond
5. Director aggregates results

### Feature 2: Context Persistence (Statement 1)

**MongoDB Collections:**
- `checkpoints` — Agent state snapshots with resume pointers

**Flow:**
1. Agent works, accumulates context
2. At checkpoint trigger (time-based, task-complete, or manual)
3. Agent writes checkpoint: `{summary, resume_pointer, tokens_used}`
4. On restart: Agent loads latest checkpoint, continues from resume_pointer

---

## Demo Script (3 minutes)

1. **Show:** Director receives complex task
2. **Show:** MongoDB Compass — `agents` collection shows Director spawning Specialists
3. **Show:** MongoDB Compass — `messages` collection shows coordination in real-time
4. **Kill:** One Specialist agent mid-task (Ctrl+C)
5. **Show:** MongoDB Compass — checkpoint exists
6. **Restart:** Agent loads checkpoint, continues
7. **Result:** Task completes successfully

---

## Session Directory

Agent context persists at:
```
docs/sessions/{YYYY-MM-DD}/
├── MISSION.md          # Today's objective
├── PLANNING.md         # Discovery + decisions
├── checkpoints/        # Agent state snapshots
└── artifacts/          # Outputs, screenshots
```

---

## Design Principles

### From Squad (Maintain These)

1. **Named exports only** — No default exports (grepability)
2. **No classes** — Functional factories
3. **Zod validation** — Runtime type safety on all inputs
4. **Contract-first** — Define types before implementation

### Hackathon-Specific

1. **Happy path only** — No complex error handling
2. **MongoDB is the UI** — Use Compass for visualization
3. **3 agents max** — Reliable demo over impressive scale
4. **Checkpoint everything** — Enable the kill/restart demo

---

## Quick Commands

```bash
# Install dependencies
pnpm install

# Run Director agent
pnpm run director

# Run Specialist agent
pnpm run specialist -- --type=researcher

# Watch MongoDB (requires mongosh)
mongosh --eval "db.messages.watch()"
```

---

## Links

- **Linear:** [Hackathon Project Board]
- **MongoDB Atlas:** [Cluster Dashboard]
- **Hackathon Page:** https://cerebralvalley.ai/e/agentic-orchestration-hackathon

---

_Last updated: 2026-01-10_
