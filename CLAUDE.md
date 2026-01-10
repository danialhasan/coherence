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

## Primary Focus: Web Approach

**We're building the Web approach (E2B + Vue + Fastify) with CLI as fallback.**

```
📁 docs/specs/
├── web/                    ← PRIMARY (start here)
│   ├── SPEC.md            # E2B + Vue + Fastify specification
│   └── DEP-GRAPH.md       # Web-specific work breakdown
│
└── cli/                    ← FALLBACK (if E2B fails)
    ├── SPEC.md            # Local + CLI specification
    └── DEP-GRAPH.md       # CLI-specific work breakdown
```

### Decision Flow

```
Hour 0-1: Run E2B Validation (pnpm tsx scripts/validate-e2b.ts)
          │
          ├─ ✅ All tests pass → Build from docs/specs/web/
          │   • E2B sandboxes for agent execution
          │   • Fastify API for control
          │   • Vue dashboard for visualization
          │
          └─ ❌ Any test fails → Switch to docs/specs/cli/
              • Local Node processes
              • CLI commands
              • Same core demo, less complexity
```

---

## Tech Stack (Web Approach)

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20.x + TypeScript |
| Package Manager | pnpm |
| Database | MongoDB Atlas |
| Validation | Zod |
| Agent Execution | **E2B Sandboxes** |
| Backend | **Fastify + WebSocket** |
| Frontend | **Vue 3 + Vite** |
| AI SDK | @anthropic-ai/sdk |

---

## Architecture (Shared Core)

Both approaches share the same core systems:

```
┌─────────────────────────────────────────────────────────────┐
│                     COORDINATION LAYER                       │
├─────────────────────────────────────────────────────────────┤
│  Message Bus (src/coordination/messages.ts)     ✅ DONE     │
│  Checkpoints (src/coordination/checkpoints.ts)  ✅ DONE     │
│  Tasks (src/coordination/tasks.ts)              🔴 TODO     │
│  Context (src/coordination/context.ts)          🔴 TODO     │
├─────────────────────────────────────────────────────────────┤
│                      AGENT LAYER                             │
├─────────────────────────────────────────────────────────────┤
│  Base Agent (src/agents/base.ts)                ✅ DONE     │
│  Director (src/agents/director.ts)              🔴 TODO     │
│  Specialist (src/agents/specialist.ts)          🔴 TODO     │
├─────────────────────────────────────────────────────────────┤
│                       DATA LAYER                             │
├─────────────────────────────────────────────────────────────┤
│  MongoDB Connection (src/db/mongo.ts)           ✅ DONE     │
│  Zod Schemas (src/db/mongo.ts)                  ✅ DONE     │
└─────────────────────────────────────────────────────────────┘
```

---

## Demo Script (3 minutes)

1. **Start:** Director receives task "Research MongoDB agent coordination"
2. **Show:** MongoDB Compass — `agents` collection shows Director spawning Specialists
3. **Show:** MongoDB Compass — `messages` collection shows coordination in real-time
4. **Watch:** Specialists execute research tasks in parallel
5. **Kill:** One Specialist agent mid-task (UI button or Ctrl+C)
6. **Show:** MongoDB Compass — `checkpoints` shows saved state
7. **Restart:** Specialist loads checkpoint, continues from last action
8. **Complete:** Director aggregates results, outputs summary

**"Wow" moment:** Kill/restart with seamless resume proves MongoDB coordination + persistence

---

## Quick Start

### Prerequisites

```bash
# Clone repo
git clone https://github.com/danialhasan/squad-lite
cd squad-lite

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your keys:
#   MONGODB_URI=mongodb+srv://...
#   ANTHROPIC_API_KEY=sk-ant-...
#   E2B_API_KEY=...
```

### Hour 0-1: Validation

```bash
# Test MongoDB connection
pnpm tsx scripts/validate-mongo.ts

# Test E2B (determines Web vs CLI path)
pnpm tsx scripts/validate-e2b.ts
```

### Development (Web Approach)

```bash
# Start backend
pnpm run dev:api

# Start frontend (separate terminal)
cd web && pnpm run dev

# Open http://localhost:3000
```

---

## Project Structure

```
squad-lite/
├── CLAUDE.md                     # This file (start here)
├── README.md                     # Project overview
├── package.json
├── tsconfig.json
├── .env.example
│
├── docs/
│   ├── specs/
│   │   ├── web/                 # ← PRIMARY SPEC
│   │   │   ├── SPEC.md
│   │   │   └── DEP-GRAPH.md
│   │   └── cli/                 # ← FALLBACK SPEC
│   │       ├── SPEC.md
│   │       └── DEP-GRAPH.md
│   └── research/                # E2B, SDK research artifacts
│
├── .claude/
│   └── skills/                  # Behavior contract skills (7 skills)
│       ├── director/SKILL.md
│       ├── specialist/
│       │   ├── researcher/SKILL.md
│       │   ├── writer/SKILL.md
│       │   └── analyst/SKILL.md
│       └── shared/
│           ├── communication/SKILL.md
│           ├── checkpointing/SKILL.md
│           └── coordination/SKILL.md
│
├── src/
│   ├── config.ts                # Environment config
│   ├── db/mongo.ts              # ✅ MongoDB + Schemas
│   ├── coordination/
│   │   ├── messages.ts          # ✅ Message bus
│   │   ├── checkpoints.ts       # ✅ Checkpoint system
│   │   ├── tasks.ts             # 🔴 Task management
│   │   └── context.ts           # 🔴 Context builder
│   ├── agents/
│   │   ├── base.ts              # ✅ Base agent
│   │   ├── director.ts          # 🔴 Director
│   │   └── specialist.ts        # 🔴 Specialist
│   ├── sandbox/                 # Web approach
│   │   └── manager.ts           # 🔴 E2B integration
│   ├── process/                 # CLI fallback
│   │   └── manager.ts           # 🔴 Local process manager
│   ├── sdk/
│   │   └── runner.ts            # 🔴 Claude SDK wrapper
│   └── api/                     # Web approach
│       ├── server.ts
│       └── routes/
│
├── web/                         # Web approach
│   ├── package.json
│   └── src/
│       ├── App.vue
│       └── components/
│
└── scripts/
    ├── validate-e2b.ts          # E2B validation script
    └── validate-mongo.ts        # MongoDB validation script
```

---

## Design Principles

### From Squad (Maintain These)

```typescript
// ✅ Named exports only
export const createAgent = () => {}

// ❌ No default exports
export default function createAgent() {}

// ✅ Factory functions
export const createRunner = (config) => ({...})

// ❌ No classes
class Runner {}

// ✅ Config layer
import { config } from './config.js'

// ❌ No direct env access
process.env.MONGODB_URI
```

### Hackathon-Specific

1. **Web-first** — Building E2B + Vue + Fastify (CLI is fallback only)
2. **Happy path only** — No complex error handling
3. **MongoDB is visibility** — Use Compass for judges
4. **3 agents max** — Reliable demo over impressive scale
5. **Checkpoint everything** — Enable the kill/restart demo
6. **Fail fast** — Validate E2B in Hour 0, pivot if needed

---

## Links

- **GitHub:** https://github.com/danialhasan/squad-lite
- **Linear:** https://linear.app/trysquad/team/HACK
- **MongoDB Atlas:** [Cluster Dashboard]
- **E2B Dashboard:** https://e2b.dev/dashboard
- **Hackathon Page:** https://cerebralvalley.ai/e/agentic-orchestration-hackathon

---

## Reading Order for Agents

1. **This file** — Overview + web focus
2. **[`docs/specs/web/SPEC.md`](docs/specs/web/SPEC.md)** — Primary specification
3. **[`docs/specs/web/DEP-GRAPH.md`](docs/specs/web/DEP-GRAPH.md)** — Work breakdown + timeline
4. **Behavior skills** — `.claude/skills/` for agent protocols

*Only read CLI spec if E2B validation fails.*

---

_Last updated: 2026-01-10 (v3.1 - Web focus with organized specs)_
