# Squad Lite — Web Approach Specification

**Version:** 3.0 (Web-First with E2B)
**Date:** 2026-01-10
**Status:** Primary approach (requires E2B validation)

---

## Overview

This spec describes the **web-first architecture** where agents run in E2B cloud sandboxes, controlled via Fastify API, and visualized in a web UI.

**Use this spec if:** E2B validation passes in Hour 0-1

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Runtime** | Node.js 20.x | ESM modules (`"type": "module"`) |
| **Language** | TypeScript 5.x | Strict mode |
| **Package Manager** | pnpm | Same as Squad |
| **Backend Framework** | Fastify | REST API + WebSocket |
| **Frontend Framework** | Vue 3 + Vite | Simple dashboard (not full app) |
| **Database** | MongoDB Atlas | Coordination + state |
| **Validation** | Zod | Runtime type safety |
| **Agent Sandboxes** | E2B | Cloud VMs for execution |
| **Agent SDK** | @anthropic-ai/sdk | Direct API (hackathon exception) |
| **Testing** | Vitest | Unit tests for core systems |

### Design Principles (from Squad)

```typescript
// ✅ Named exports only
export const createAgent = () => {}

// ❌ No default exports
export default function createAgent() {}

// ✅ Factory functions
export const createSandboxManager = (config: Config) => ({
  create: () => {},
  kill: () => {},
})

// ❌ No classes
class SandboxManager {}

// ✅ Config layer for env
import { config } from './config.js'
const uri = config.mongodbUri

// ❌ No direct env access
const uri = process.env.MONGODB_URI
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           WEB BROWSER                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Vue 3 Dashboard                                                    │  │
│  │  • Agent status cards                                               │  │
│  │  • Message feed (real-time)                                         │  │
│  │  • Checkpoint timeline                                              │  │
│  │  • Demo controls: [Spawn] [Kill] [Restart]                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket + REST
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FASTIFY BACKEND                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Agent Routes    │  │ Sandbox Routes  │  │ WebSocket Handler       │  │
│  │ POST /agents    │  │ GET /sandboxes  │  │ • stdout streaming      │  │
│  │ DELETE /agents  │  │ POST /:id/pause │  │ • message notifications │  │
│  │ POST /task      │  │ POST /:id/resume│  │ • checkpoint events     │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
│           │                    │                        │               │
│  ┌────────┴────────────────────┴────────────────────────┴────────────┐  │
│  │                      Core Services                                 │  │
│  │  • AgentOrchestrator (spawn, coordinate, aggregate)                │  │
│  │  • SandboxManager (E2B lifecycle)                                  │  │
│  │  • ClaudeRunner (SDK integration)                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌──────────────────────┐      ┌─────────────────────────────────────────┐
│   MONGODB ATLAS      │      │            E2B SANDBOXES                │
│                      │      │                                         │
│  Collections:        │      │  ┌─────────────┐  ┌─────────────┐      │
│  • agents            │◀─────│  │ Director    │  │ Specialist  │      │
│  • messages          │      │  │ Sandbox     │  │ Sandbox     │      │
│  • checkpoints       │      │  │             │  │             │      │
│  • tasks             │      │  │ Claude SDK  │  │ Claude SDK  │      │
│  • sandbox_tracking  │      │  │ running     │  │ running     │      │
│                      │      │  └─────────────┘  └─────────────┘      │
└──────────────────────┘      └─────────────────────────────────────────┘
```

---

## Project Structure

```
squad-lite/
├── package.json
├── tsconfig.json
├── .env.example
├── .claude/
│   └── skills/                    # Behavior contracts (7 skills)
├── docs/
│   ├── SPEC-WEB.md               # This file
│   ├── SPEC-CLI.md               # Fallback spec
│   └── DEP-GRAPH.md              # Work breakdown
├── src/
│   ├── config.ts                 # Environment config (no direct env access)
│   ├── db/
│   │   └── mongo.ts              # ✅ DONE (Tier 0)
│   ├── coordination/
│   │   ├── messages.ts           # ✅ DONE (Tier 0)
│   │   ├── checkpoints.ts        # ✅ DONE (Tier 0)
│   │   ├── tasks.ts              # 🔴 TODO
│   │   └── context.ts            # 🔴 TODO
│   ├── agents/
│   │   ├── base.ts               # ✅ DONE (Tier 0)
│   │   ├── director.ts           # 🔴 TODO
│   │   └── specialist.ts         # 🔴 TODO
│   ├── sandbox/
│   │   └── manager.ts            # 🔴 TODO (E2B integration)
│   ├── sdk/
│   │   └── runner.ts             # 🔴 TODO (Claude SDK)
│   └── api/
│       ├── server.ts             # 🔴 TODO (Fastify)
│       ├── routes/
│       │   ├── agents.ts         # 🔴 TODO
│       │   └── sandboxes.ts      # 🔴 TODO
│       └── websocket.ts          # 🔴 TODO
└── web/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.vue               # 🔴 TODO
        ├── components/
        │   ├── AgentCard.vue     # 🔴 TODO
        │   ├── MessageFeed.vue   # 🔴 TODO
        │   └── DemoControls.vue  # 🔴 TODO
        └── stores/
            └── agents.ts         # 🔴 TODO (Pinia)
```

---

## Systems Breakdown

### Tier 0: Foundation (✅ DONE)

| System | File | Status |
|--------|------|--------|
| MongoDB Connection | `src/db/mongo.ts` | ✅ |
| Zod Schemas | `src/db/mongo.ts` | ✅ |
| Agent Registry | `src/agents/base.ts` | ✅ |
| Message Bus | `src/coordination/messages.ts` | ✅ |
| Checkpoints | `src/coordination/checkpoints.ts` | ✅ |

### Tier 1: Core Services (BUILD FIRST)

| System | File | Time | Notes |
|--------|------|------|-------|
| Config Layer | `src/config.ts` | 15m | No direct env access |
| E2B Sandbox Manager | `src/sandbox/manager.ts` | 1h | **Critical path** |
| Task Management | `src/coordination/tasks.ts` | 30m | |
| Context Management | `src/coordination/context.ts` | 45m | |
| Claude SDK Runner | `src/sdk/runner.ts` | 1h | |

### Tier 2: Agent Implementation

| System | File | Time | Notes |
|--------|------|------|-------|
| Director Agent | `src/agents/director.ts` | 1.5h | |
| Specialist Agent | `src/agents/specialist.ts` | 1h | Parallel with Director |

### Tier 3: Web Layer

| System | File | Time | Notes |
|--------|------|------|-------|
| Fastify Server | `src/api/server.ts` | 30m | |
| Agent Routes | `src/api/routes/agents.ts` | 30m | |
| WebSocket Handler | `src/api/websocket.ts` | 30m | |
| Vue Dashboard | `web/src/App.vue` | 1h | Simple, functional |

---

## E2B Integration Details

### Sandbox Manager Interface

```typescript
// src/sandbox/manager.ts

import { Sandbox } from '@e2b/sdk'
import { config } from '../config.js'

export type SandboxConfig = {
  agentId: string
  agentType: 'director' | 'specialist'
  specialization?: string
}

export type SandboxInstance = {
  sandboxId: string
  agentId: string
  sandbox: Sandbox
  status: 'active' | 'paused' | 'killed'
}

export const createSandboxManager = () => {
  const sandboxes = new Map<string, SandboxInstance>()

  return {
    create: async (cfg: SandboxConfig): Promise<SandboxInstance> => {
      const sandbox = await Sandbox.create({
        apiKey: config.e2bApiKey,
        timeoutMs: 10 * 60 * 1000,
        metadata: {
          agentId: cfg.agentId,
          agentType: cfg.agentType,
          specialization: cfg.specialization,
        },
      })

      const instance: SandboxInstance = {
        sandboxId: sandbox.id,
        agentId: cfg.agentId,
        sandbox,
        status: 'active',
      }

      sandboxes.set(cfg.agentId, instance)
      await syncToMongo(instance)

      return instance
    },

    execute: async (agentId: string, command: string, onStdout?: (data: string) => void) => {
      const instance = sandboxes.get(agentId)
      if (!instance) throw new Error(`No sandbox for agent ${agentId}`)

      return instance.sandbox.commands.run(command, {
        onStdout: (data) => onStdout?.(data.toString()),
        onStderr: (data) => console.error(`[${agentId}] stderr:`, data.toString()),
      })
    },

    pause: async (agentId: string) => {
      const instance = sandboxes.get(agentId)
      if (!instance) throw new Error(`No sandbox for agent ${agentId}`)

      await instance.sandbox.pause()
      instance.status = 'paused'
      await syncToMongo(instance)
    },

    resume: async (agentId: string) => {
      const instance = sandboxes.get(agentId)
      if (!instance) throw new Error(`No sandbox for agent ${agentId}`)

      await instance.sandbox.resume()
      instance.status = 'active'
      await syncToMongo(instance)
    },

    kill: async (agentId: string) => {
      const instance = sandboxes.get(agentId)
      if (!instance) return

      await instance.sandbox.kill()
      instance.status = 'killed'
      await syncToMongo(instance)
      sandboxes.delete(agentId)
    },

    get: (agentId: string) => sandboxes.get(agentId),

    list: () => Array.from(sandboxes.values()),
  }
}
```

### Claude SDK Runner

```typescript
// src/sdk/runner.ts

import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config.js'
import { readFileSync } from 'fs'

export type RunConfig = {
  agentId: string
  agentType: 'director' | 'specialist'
  specialization?: string
  task: string
  resumeContext?: string
}

const loadSkillContent = (agentType: string, specialization?: string): string => {
  const basePath = '.claude/skills'

  if (agentType === 'director') {
    return readFileSync(`${basePath}/director/SKILL.md`, 'utf8')
  }

  if (specialization) {
    return readFileSync(`${basePath}/specialist/${specialization}/SKILL.md`, 'utf8')
  }

  return ''
}

export const createClaudeRunner = () => {
  const client = new Anthropic({ apiKey: config.anthropicApiKey })

  return {
    run: async (cfg: RunConfig, onMessage?: (content: string) => void) => {
      const skillContent = loadSkillContent(cfg.agentType, cfg.specialization)

      const systemPrompt = `${skillContent}

## Agent Identity
- Agent ID: ${cfg.agentId}
- Type: ${cfg.agentType}
${cfg.specialization ? `- Specialization: ${cfg.specialization}` : ''}

## Tools Available
You have access to Squad Lite coordination tools:
- checkInbox() - Get unread messages
- sendMessage(to, content, type) - Send message to another agent
- checkpoint(summary, resumePointer) - Save state for resume
- createTask(title, description) - Create work unit
- assignTask(taskId, agentId) - Assign to specialist

${cfg.resumeContext ? `## Resuming from Checkpoint\n${cfg.resumeContext}` : ''}`

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          { role: 'user', content: cfg.task }
        ],
      })

      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n')

      onMessage?.(content)

      return {
        content,
        stopReason: response.stop_reason,
        usage: response.usage,
      }
    },
  }
}
```

---

## API Endpoints

### Agent Routes

```typescript
// POST /api/agents - Spawn Director
{
  "request": {},
  "response": {
    "agentId": "uuid",
    "sandboxId": "e2b-sandbox-id",
    "status": "idle"
  }
}

// POST /api/agents/:id/task - Submit task
{
  "request": {
    "task": "Research MongoDB agent coordination patterns"
  },
  "response": {
    "taskId": "uuid",
    "status": "assigned"
  }
}

// GET /api/agents/:id/status - Get status
{
  "response": {
    "agentId": "uuid",
    "status": "working",
    "currentTask": "uuid",
    "sandboxStatus": "active",
    "lastHeartbeat": "2026-01-10T10:30:00Z"
  }
}

// DELETE /api/agents/:id - Kill agent
{
  "response": {
    "agentId": "uuid",
    "status": "killed",
    "checkpointId": "uuid"  // Last checkpoint before kill
  }
}

// POST /api/agents/:id/restart - Restart from checkpoint
{
  "response": {
    "agentId": "uuid",
    "status": "idle",
    "resumedFrom": "checkpoint-uuid"
  }
}
```

### WebSocket Events

```typescript
// Client → Server
'agent:spawn'     // Spawn new agent
'agent:kill'      // Kill agent
'agent:restart'   // Restart from checkpoint

// Server → Client
'agent:created'   // Agent spawned
'agent:status'    // Status update
'agent:output'    // Stdout from sandbox
'message:new'     // New message in bus
'checkpoint:new'  // New checkpoint created
'sandbox:event'   // E2B lifecycle event
```

---

## Vue Dashboard (Minimal)

```vue
<!-- web/src/App.vue -->
<template>
  <div class="dashboard">
    <header>
      <h1>Squad Lite Demo</h1>
      <DemoControls @spawn="spawnAgent" @kill="killAgent" />
    </header>

    <main>
      <section class="agents">
        <AgentCard
          v-for="agent in agents"
          :key="agent.agentId"
          :agent="agent"
        />
      </section>

      <section class="messages">
        <MessageFeed :messages="messages" />
      </section>
    </main>
  </div>
</template>
```

---

## Demo Flow (Web)

```
1. Open browser to http://localhost:3000
2. Click [Spawn Director]
   → Director sandbox created in E2B
   → Agent card appears with "idle" status

3. Enter task: "Research MongoDB agent coordination"
4. Click [Submit]
   → Director decomposes task
   → 2 Specialist sandboxes created
   → Message feed shows task assignments

5. Watch agents work
   → Real-time stdout in output panels
   → Messages flowing between agents
   → Checkpoints appearing in timeline

6. Click [Kill] on Specialist 1 mid-task
   → Sandbox killed
   → Checkpoint shown in UI
   → Agent card shows "killed" status

7. Click [Restart] on Specialist 1
   → New sandbox created
   → Checkpoint loaded
   → Agent resumes from checkpoint

8. Task completes
   → Final result displayed
   → All checkpoints visible in MongoDB Compass
```

---

## Success Criteria (Web Approach)

- [ ] E2B sandboxes create/kill/restart reliably
- [ ] Claude SDK runs inside E2B sandboxes
- [ ] WebSocket streams real-time output
- [ ] Vue dashboard shows agent status
- [ ] Kill/restart demo works 3/3 times
- [ ] Demo completes in < 3 minutes

---

_Use this spec if E2B validation passes. Otherwise, switch to SPEC-CLI.md._
