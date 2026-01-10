# Squad Lite — CLI Fallback Specification

**Version:** 3.0 (Local Execution)
**Date:** 2026-01-10
**Status:** Fallback approach (if E2B validation fails)

---

## Overview

This spec describes the **CLI-first architecture** where agents run as local Node.js processes, controlled via terminal commands, and visualized in MongoDB Compass.

**Use this spec if:** E2B validation fails in Hour 0-1, OR E2B is too buggy/slow

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Runtime** | Node.js 20.x | ESM modules (`"type": "module"`) |
| **Language** | TypeScript 5.x | Strict mode |
| **Package Manager** | pnpm | Same as Squad |
| **CLI Framework** | Commander.js | Simple CLI interface |
| **Database** | MongoDB Atlas | Coordination + state |
| **Validation** | Zod | Runtime type safety |
| **Agent Execution** | Local processes | Node.js child processes |
| **Agent SDK** | @anthropic-ai/sdk | Direct API (hackathon exception) |
| **Testing** | Vitest | Unit tests for core systems |

### Design Principles (from Squad)

```typescript
// ✅ Named exports only
export const createAgent = () => {}

// ❌ No default exports
export default function createAgent() {}

// ✅ Factory functions
export const createProcessManager = (config: Config) => ({
  spawn: () => {},
  kill: () => {},
})

// ❌ No classes
class ProcessManager {}

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
│                         TERMINAL (Split View)                            │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  Terminal 1: Director        │  │  Terminal 2: MongoDB Compass     │  │
│  │  $ pnpm run director         │  │  • agents collection (live)     │  │
│  │                              │  │  • messages collection (live)   │  │
│  │  [Director] Starting...      │  │  • checkpoints collection       │  │
│  │  [Director] Decomposing task │  │                                  │  │
│  │  [Director] Spawning spec-1  │  │  ┌─────┬─────┬─────┬──────────┐  │  │
│  │  [spec-1] Researching...     │  │  │ _id │type │status│lastBeat │  │  │
│  │  [spec-2] Researching...     │  │  ├─────┼─────┼─────┼──────────┤  │  │
│  │  ...                         │  │  │ abc │dir  │work │10:30:05  │  │  │
│  │                              │  │  │ def │spec │work │10:30:07  │  │  │
│  └──────────────────────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                │
                │ Local Node.js processes
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         LOCAL PROCESSES                                  │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ Director        │  │ Specialist 1    │  │ Specialist 2    │         │
│  │ (Node process)  │  │ (Node process)  │  │ (Node process)  │         │
│  │                 │  │                 │  │                 │         │
│  │ PID: 12345      │  │ PID: 12346      │  │ PID: 12347      │         │
│  │ Claude SDK      │  │ Claude SDK      │  │ Claude SDK      │         │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘         │
│           │                    │                    │                   │
│           └────────────────────┼────────────────────┘                   │
│                                │                                        │
│                                ▼                                        │
│                    ┌───────────────────────┐                           │
│                    │    MONGODB ATLAS      │                           │
│                    │                       │                           │
│                    │  Collections:         │                           │
│                    │  • agents             │                           │
│                    │  • messages           │                           │
│                    │  • checkpoints        │                           │
│                    │  • tasks              │                           │
│                    └───────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────┘
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
│   ├── SPEC-WEB.md               # Web approach spec
│   ├── SPEC-CLI.md               # This file
│   └── DEP-GRAPH.md              # Work breakdown
├── src/
│   ├── config.ts                 # Environment config
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
│   ├── process/
│   │   └── manager.ts            # 🔴 TODO (replaces sandbox/)
│   ├── sdk/
│   │   └── runner.ts             # 🔴 TODO (Claude SDK)
│   └── cli/
│       ├── index.ts              # 🔴 TODO (CLI entry)
│       ├── director.ts           # 🔴 TODO (director command)
│       └── specialist.ts         # 🔴 TODO (specialist command)
└── scripts/
    └── demo.sh                   # 🔴 TODO (demo script)
```

---

## Systems Breakdown

### Tier 0: Foundation (✅ DONE — Same as Web)

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
| Process Manager | `src/process/manager.ts` | 30m | **Simpler than E2B** |
| Task Management | `src/coordination/tasks.ts` | 30m | Same as Web |
| Context Management | `src/coordination/context.ts` | 45m | Same as Web |
| Claude SDK Runner | `src/sdk/runner.ts` | 45m | **Simpler (no E2B)** |

### Tier 2: Agent Implementation

| System | File | Time | Notes |
|--------|------|------|-------|
| Director Agent | `src/agents/director.ts` | 1.5h | Same logic as Web |
| Specialist Agent | `src/agents/specialist.ts` | 1h | Same logic as Web |

### Tier 3: CLI Layer

| System | File | Time | Notes |
|--------|------|------|-------|
| CLI Entry | `src/cli/index.ts` | 15m | Commander.js setup |
| Director Command | `src/cli/director.ts` | 15m | `pnpm run director` |
| Specialist Command | `src/cli/specialist.ts` | 15m | `pnpm run specialist` |
| Demo Script | `scripts/demo.sh` | 15m | Scripted demo flow |

---

## Process Manager (Local Execution)

```typescript
// src/process/manager.ts

import { spawn, ChildProcess } from 'child_process'
import { v4 as uuid } from 'uuid'
import { getAgentsCollection } from '../db/mongo.js'

export type ProcessConfig = {
  agentId: string
  agentType: 'director' | 'specialist'
  specialization?: string
  task?: string
}

export type ProcessInstance = {
  processId: string
  agentId: string
  process: ChildProcess
  status: 'running' | 'stopped' | 'killed'
}

export const createProcessManager = () => {
  const processes = new Map<string, ProcessInstance>()

  return {
    spawn: async (cfg: ProcessConfig): Promise<ProcessInstance> => {
      const command = cfg.agentType === 'director' ? 'director' : 'specialist'
      const args = [
        'run',
        command,
        '--agent-id', cfg.agentId,
        ...(cfg.specialization ? ['--specialization', cfg.specialization] : []),
        ...(cfg.task ? ['--task', cfg.task] : []),
      ]

      const child = spawn('pnpm', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      const instance: ProcessInstance = {
        processId: uuid(),
        agentId: cfg.agentId,
        process: child,
        status: 'running',
      }

      // Stream stdout to console with prefix
      child.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean)
        lines.forEach((line: string) => {
          console.log(`[${cfg.agentId.slice(0, 8)}] ${line}`)
        })
      })

      // Stream stderr to console
      child.stderr?.on('data', (data) => {
        console.error(`[${cfg.agentId.slice(0, 8)}] ERROR: ${data}`)
      })

      // Handle process exit
      child.on('exit', (code) => {
        instance.status = code === 0 ? 'stopped' : 'killed'
        console.log(`[${cfg.agentId.slice(0, 8)}] Process exited with code ${code}`)
      })

      processes.set(cfg.agentId, instance)

      return instance
    },

    kill: async (agentId: string): Promise<void> => {
      const instance = processes.get(agentId)
      if (!instance) return

      instance.process.kill('SIGTERM')
      instance.status = 'killed'

      // Update MongoDB
      const agents = await getAgentsCollection()
      await agents.updateOne(
        { agentId },
        { $set: { status: 'error', lastHeartbeat: new Date() } }
      )
    },

    restart: async (agentId: string, cfg: Omit<ProcessConfig, 'agentId'>): Promise<ProcessInstance> => {
      // Kill existing if running
      await createProcessManager().kill(agentId)

      // Spawn new with resume flag
      return createProcessManager().spawn({
        ...cfg,
        agentId,
      })
    },

    get: (agentId: string) => processes.get(agentId),

    list: () => Array.from(processes.values()),
  }
}
```

---

## CLI Commands

### Director Command

```typescript
// src/cli/director.ts

import { Command } from 'commander'
import { v4 as uuid } from 'uuid'
import { initializeAgent } from '../agents/base.js'
import { createClaudeRunner } from '../sdk/runner.js'
import { resumeFromCheckpoint } from '../coordination/checkpoints.js'

export const directorCommand = new Command('director')
  .description('Start Director agent')
  .option('--agent-id <id>', 'Agent ID (for resume)')
  .option('--task <task>', 'Task to execute')
  .action(async (options) => {
    const agentId = options.agentId || uuid()

    console.log(`[Director] Starting with ID: ${agentId.slice(0, 8)}`)

    // Check for checkpoint
    const { hasCheckpoint, resumeContext } = await resumeFromCheckpoint(agentId)

    if (hasCheckpoint) {
      console.log(`[Director] Resuming from checkpoint`)
    }

    // Initialize agent
    const { agent } = await initializeAgent({
      type: 'director',
    })

    // Run Claude
    const runner = createClaudeRunner()

    const task = options.task || 'Research MongoDB agent coordination patterns'

    const result = await runner.run({
      agentId: agent.agentId,
      agentType: 'director',
      task,
      resumeContext: resumeContext || undefined,
    }, (content) => {
      console.log(`[Director] ${content.slice(0, 100)}...`)
    })

    console.log(`[Director] Task complete. Stop reason: ${result.stopReason}`)
  })
```

### Specialist Command

```typescript
// src/cli/specialist.ts

import { Command } from 'commander'
import { v4 as uuid } from 'uuid'
import { initializeAgent } from '../agents/base.js'
import { createClaudeRunner } from '../sdk/runner.js'
import { resumeFromCheckpoint } from '../coordination/checkpoints.js'
import { pollInbox } from '../coordination/messages.js'

export const specialistCommand = new Command('specialist')
  .description('Start Specialist agent')
  .option('--agent-id <id>', 'Agent ID (for resume)')
  .option('--specialization <type>', 'Specialization type', 'researcher')
  .option('--parent <id>', 'Parent Director ID')
  .action(async (options) => {
    const agentId = options.agentId || uuid()
    const specialization = options.specialization as 'researcher' | 'writer' | 'analyst'

    console.log(`[Specialist:${specialization}] Starting with ID: ${agentId.slice(0, 8)}`)

    // Check for checkpoint
    const { hasCheckpoint, resumeContext } = await resumeFromCheckpoint(agentId)

    if (hasCheckpoint) {
      console.log(`[Specialist] Resuming from checkpoint`)
    }

    // Initialize agent
    const { agent } = await initializeAgent({
      type: 'specialist',
      specialization,
      parentId: options.parent,
    })

    // Poll for tasks
    console.log(`[Specialist] Waiting for tasks...`)

    const message = await pollInbox(agent.agentId, 60000) // 60s timeout

    if (!message) {
      console.log(`[Specialist] No tasks received, exiting`)
      return
    }

    console.log(`[Specialist] Received task: ${message.content.slice(0, 50)}...`)

    // Run Claude
    const runner = createClaudeRunner()

    const result = await runner.run({
      agentId: agent.agentId,
      agentType: 'specialist',
      specialization,
      task: message.content,
      resumeContext: resumeContext || undefined,
    }, (content) => {
      console.log(`[Specialist] ${content.slice(0, 100)}...`)
    })

    console.log(`[Specialist] Task complete. Stop reason: ${result.stopReason}`)
  })
```

---

## Demo Script (CLI)

```bash
#!/bin/bash
# scripts/demo.sh

echo "=== Squad Lite Demo (CLI Mode) ==="
echo ""

# Terminal 1: Start Director
echo "Starting Director..."
pnpm run director --task "Research MongoDB agent coordination patterns" &
DIRECTOR_PID=$!

sleep 5

# Check MongoDB for spawned specialists
echo "Director spawned specialists. Check MongoDB Compass."
echo ""

sleep 10

# Kill a specialist (simulating crash)
echo "Simulating crash: Killing Specialist 1..."
# In real demo, you'd Ctrl+C in the terminal or use process manager
pkill -f "specialist --agent-id"

sleep 3

# Show checkpoint in MongoDB
echo "Checkpoint created. Check 'checkpoints' collection in Compass."
echo ""

# Restart specialist
echo "Restarting Specialist from checkpoint..."
pnpm run specialist --agent-id "$SPECIALIST_ID" &

sleep 10

# Wait for completion
wait $DIRECTOR_PID

echo ""
echo "=== Demo Complete ==="
```

---

## Demo Flow (CLI)

```
1. Open two terminal windows side-by-side with MongoDB Compass

2. Terminal 1: Run Director
   $ pnpm run director --task "Research MongoDB agent coordination"

   [Director] Starting with ID: abc12345
   [Director] Decomposing task into 2 subtasks
   [Director] Spawning specialist: researcher
   [Director] Spawning specialist: researcher

3. Watch MongoDB Compass
   - agents collection: 3 agents appear (1 director, 2 specialists)
   - messages collection: Task messages flowing
   - checkpoints: Periodic checkpoints created

4. Terminal 1: Ctrl+C to kill Specialist 1
   [spec-1] ^C
   [spec-1] Process exited with code 130

5. MongoDB Compass: Show checkpoint
   - checkpoints collection: Latest checkpoint for killed specialist
   - Show resumePointer with nextAction

6. Terminal 1: Restart Specialist
   $ pnpm run specialist --agent-id <spec-1-id>

   [Specialist] Resuming from checkpoint
   [Specialist] Next action: Analyze source 2 for patterns
   [Specialist] Continuing research...

7. Watch task complete
   - Director aggregates results
   - Final output displayed
```

---

## Time Savings (CLI vs Web)

| Component | Web Approach | CLI Approach | Savings |
|-----------|--------------|--------------|---------|
| E2B Sandbox Manager | 1h | 0h | **1h** |
| Process Manager | 0h | 30m | -30m |
| Fastify API | 30m | 0h | **30m** |
| WebSocket Handler | 30m | 0h | **30m** |
| Vue Dashboard | 1h | 0h | **1h** |
| CLI Commands | 0h | 30m | -30m |

**Net savings: ~2 hours** → More buffer for debugging and demo polish

---

## Success Criteria (CLI Approach)

- [ ] Director spawns specialists as child processes
- [ ] Message bus coordinates between processes
- [ ] Checkpoints saved to MongoDB
- [ ] Kill (Ctrl+C) creates checkpoint
- [ ] Restart loads checkpoint and resumes
- [ ] MongoDB Compass shows all state changes
- [ ] Demo completes in < 3 minutes
- [ ] Kill/restart demo works 3/3 times

---

## When to Use This Spec

Use SPEC-CLI.md if any of these occur during E2B validation:

1. **E2B sandbox creation fails** (API errors, timeout)
2. **E2B command execution is unreliable** (hanging, inconsistent)
3. **E2B pause/resume doesn't work** (can't preserve state)
4. **E2B latency is unacceptable** (> 5s for operations)
5. **Time pressure** — Behind schedule, need faster path

The CLI approach delivers the **same core demo** (multi-agent coordination + checkpoint resume) with **less complexity** and **more reliability**.

---

_Use this spec if E2B validation fails. The core demo (kill/restart + MongoDB coordination) works the same way._
