# Dependency Graph — CLI Fallback Approach

**Approach:** Local Node Processes + Terminal + MongoDB Compass
**Total Work:** 6 work packages, ~4.5 hours
**Critical Path:** 4 hours (with parallelization)
**Buffer:** +2.5 hours (compared to Web approach)

---

## When to Use This Spec

Switch to CLI approach if E2B validation fails:

```
E2B Validation (Hour 0-1):
  ├─ Sandbox creation fails → Use this spec
  ├─ Command execution unreliable → Use this spec
  ├─ Pause/resume broken → Use this spec
  └─ Latency > 5s for operations → Use this spec
```

**Benefit:** ~2 hours less complexity, same core demo.

---

## Visual Dependency Graph

```
TIER 0 (✅ DONE)                 TIER 1 (Hours 1-2.5)                  TIER 2 (Hours 2.5-4)            TIER 3 (Hour 4-4.5)
════════════════                 ════════════════════                  ════════════════════            ═══════════════════

┌──────────────┐
│ S1: MongoDB  │───┐
│ Connection   │   │
└──────────────┘   │
                   │
┌──────────────┐   │
│ S2: Zod      │───┤
│ Schemas      │   │
└──────────────┘   │
                   │
┌──────────────┐   │          ┌────────────────┐
│ S3: Agent    │───┼─────────▶│ WP1: Config    │──────┐
│ Registry     │   │          │ Layer (15m)    │      │
└──────────────┘   │          └────────────────┘      │
                   │                                   │
┌──────────────┐   │          ┌────────────────┐      │
│ S4: Message  │───┼─────────▶│ WP2: Process   │──────┤
│ Bus          │   │          │ Manager (30m)  │      │
└──────────────┘   │          └────────────────┘      │
                   │                                   │          ┌────────────────┐
┌──────────────┐   │          ┌────────────────┐      ├─────────▶│ WP4: Director  │────┐
│ S5: Checkpoint│──┼─────────▶│ WP3: Context   │──────┤          │ Agent (1.5h)   │    │
│ System       │   │          │ + SDK (1h)     │      │          └────────────────┘    │
└──────────────┘   │          └────────────────┘      │                                 │
                   │                                   │          ┌────────────────┐    │
                   │                                   └─────────▶│ WP5: Specialist│    │
                   │                                              │ Agent (1h)     │    │
                   │                                              └────────────────┘    │
                   │                                                                    │
                   │                                              ┌────────────────┐    │
                   └─────────────────────────────────────────────▶│ WP6: CLI + Demo│◀───┘
                                                                  │ Polish (45m)   │
                                                                  └────────────────┘
```

---

## Parallel Execution Timeline

### Hour 1-1.5: Foundation (Parallel)

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│  DEVELOPER A (Danial)               │     │  DEVELOPER B (Shafan)               │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  WP1: Config Layer (15m)            │     │  WP2: Process Manager (30m)         │
│  • src/config.ts                    │     │  • src/process/manager.ts           │
│  • Load env vars via config object  │     │  • spawn() - Fork Node process      │
│  • Export typed config              │     │  • kill() - SIGTERM process         │
│                                     │     │  • restart() - Kill + respawn       │
│  Then help with WP2                 │     │  • Stream stdout/stderr             │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  Output: Config ready               │     │  Output: Process manager ready      │
└─────────────────────────────────────┘     └─────────────────────────────────────┘
```

### Hour 1.5-2.5: SDK Integration (Both)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BOTH DEVELOPERS (Pair Programming)                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  WP3: Context Management + Claude SDK (1h)                              │
│                                                                         │
│  • src/coordination/context.ts (30m)                                    │
│    - buildContextPacket() - Checkpoint + messages                       │
│    - trackTokens() - Monitor usage                                      │
│                                                                         │
│  • src/sdk/runner.ts (30m)                                              │
│    - createClaudeRunner() - Factory                                     │
│    - run() - Execute with skill injection                               │
│    - Simpler: No E2B integration needed                                 │
│                                                                         │
│  Integration test: Run Claude locally with skills                       │
├─────────────────────────────────────────────────────────────────────────┤
│  Output: Agents can run Claude SDK locally                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Hour 2.5-4: Agent Implementation (Parallel)

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│  DEVELOPER A                        │     │  DEVELOPER B                        │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  WP4: Director Agent (1.5h)         │     │  WP5: Specialist Agent (1h)         │
│  • src/agents/director.ts           │     │  • src/agents/specialist.ts         │
│  • start() - Initialize             │     │  • start() - Initialize             │
│  • decompose() - Task breakdown     │     │  • pollForTasks() - Check inbox     │
│  • spawnSpecialist() - Fork process │     │  • executeTask() - Research/write   │
│  • coordinateWork() - Message loop  │     │  • reportResult() - Send to Director│
│  • aggregateResults() - Combine     │     │  • checkpoint() - Save state        │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  Output: Director orchestrating     │     │  Output: Specialist executing       │
└─────────────────────────────────────┘     └─────────────────────────────────────┘
```

### Hour 4-4.5: CLI + Demo (Both)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BOTH DEVELOPERS                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  WP6: CLI Commands + Demo Polish (45m)                                  │
│                                                                         │
│  • src/cli/index.ts - CLI entry with Commander.js (15m)                 │
│  • pnpm run director --task "..." command                               │
│  • pnpm run specialist --specialization researcher                      │
│                                                                         │
│  • Demo polish (30m)                                                    │
│    - Test kill/restart flow 3 times                                     │
│    - Verify MongoDB Compass shows updates                               │
│    - Practice 3-minute pitch                                            │
│    - Record backup video                                                │
├─────────────────────────────────────────────────────────────────────────┤
│  Output: Demo ready with extra buffer time                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Work Package Details

### WP1: Config Layer (15 min)

**File:** `src/config.ts`
**Same as Web approach**

```typescript
import { z } from 'zod'

const ConfigSchema = z.object({
  mongodbUri: z.string().url(),
  mongodbDbName: z.string().default('squad-lite'),
  anthropicApiKey: z.string().startsWith('sk-ant-'),
  port: z.number().default(3001),
  // Note: No E2B config needed
})

export const config = ConfigSchema.parse({
  mongodbUri: process.env.MONGODB_URI,
  mongodbDbName: process.env.MONGODB_DB_NAME,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  port: Number(process.env.PORT) || 3001,
})
```

---

### WP2: Process Manager (30 min)

**File:** `src/process/manager.ts`
**Owner:** Developer B

**Functions:**
- `spawn(config)` - Fork Node.js child process
- `kill(agentId)` - Send SIGTERM
- `restart(agentId, config)` - Kill + respawn
- `list()` - Get all running processes

**Key difference from E2B:**
- Uses Node.js `child_process.spawn()` instead of E2B SDK
- Simpler, no network calls, instant startup
- stdout/stderr streamed to parent terminal

```typescript
import { spawn, ChildProcess } from 'child_process'

export const createProcessManager = () => {
  const processes = new Map<string, ChildProcess>()

  return {
    spawn: async (cfg: ProcessConfig) => {
      const child = spawn('pnpm', ['run', cfg.command, ...cfg.args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      })

      child.stdout?.on('data', (data) => {
        console.log(`[${cfg.agentId.slice(0, 8)}] ${data}`)
      })

      processes.set(cfg.agentId, child)
      return { agentId: cfg.agentId, pid: child.pid }
    },

    kill: async (agentId: string) => {
      const child = processes.get(agentId)
      if (child) {
        child.kill('SIGTERM')
        processes.delete(agentId)
      }
    },
  }
}
```

---

### WP3: Context + SDK (1 hour)

**Files:** `src/coordination/context.ts`, `src/sdk/runner.ts`
**Simpler than Web approach** - No E2B integration

```typescript
// src/sdk/runner.ts - Simplified for CLI
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { config } from '../config.js'

export const createClaudeRunner = () => {
  const client = new Anthropic({ apiKey: config.anthropicApiKey })

  return {
    run: async (cfg: RunConfig) => {
      const skillContent = loadSkillContent(cfg.agentType, cfg.specialization)

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: `${skillContent}\n\n## Agent ID: ${cfg.agentId}`,
        messages: [{ role: 'user', content: cfg.task }],
      })

      return response
    },
  }
}
```

---

### WP4: Director Agent (1.5 hours)

**File:** `src/agents/director.ts`
**Same logic as Web approach, but uses Process Manager instead of E2B**

```typescript
// Difference: spawnSpecialist uses process manager
const spawnSpecialist = async (type: string, taskId: string) => {
  const agentId = uuid()

  // Use local process instead of E2B sandbox
  await processManager.spawn({
    agentId,
    command: 'specialist',
    args: ['--agent-id', agentId, '--specialization', type],
  })

  // Send task via MongoDB message bus (same as Web)
  await sendMessage({
    fromAgent: directorId,
    toAgent: agentId,
    content: JSON.stringify({ taskId, ...taskDetails }),
    type: 'task',
  })

  return agentId
}
```

---

### WP5: Specialist Agent (1 hour)

**File:** `src/agents/specialist.ts`
**Same logic as Web approach**

---

### WP6: CLI + Demo (45 min)

**File:** `src/cli/index.ts`

```typescript
import { Command } from 'commander'
import { directorCommand } from './director.js'
import { specialistCommand } from './specialist.js'

const program = new Command()
  .name('squad-lite')
  .description('Multi-agent coordination demo')
  .version('1.0.0')

program.addCommand(directorCommand)
program.addCommand(specialistCommand)

program.parse()
```

**package.json scripts:**
```json
{
  "scripts": {
    "director": "tsx src/cli/index.ts director",
    "specialist": "tsx src/cli/index.ts specialist"
  }
}
```

---

## Demo Flow (CLI)

```bash
# Terminal 1: Director
$ pnpm run director --task "Research MongoDB agent coordination"

[director-abc] Starting Director...
[director-abc] Decomposing task into 2 subtasks
[director-abc] Spawning specialist: researcher
[spec-123] Starting Specialist (researcher)...
[spec-456] Starting Specialist (researcher)...
[spec-123] Researching MongoDB patterns...
[spec-456] Researching agent coordination...

# Terminal 2: MongoDB Compass (open to see updates)

# Kill specialist mid-task
$ Ctrl+C on spec-123 process (or kill from another terminal)

[spec-123] Process killed. Checkpoint saved.

# Check MongoDB Compass → checkpoints collection shows state

# Restart specialist
$ pnpm run specialist --agent-id spec-123 --specialization researcher

[spec-123] Resuming from checkpoint...
[spec-123] Next action: Analyze source 2 for patterns
[spec-123] Continuing research...

# Task completes
[director-abc] Aggregating results...
[director-abc] Task complete!
```

---

## Time Comparison

| Component | Web Approach | CLI Approach | Difference |
|-----------|--------------|--------------|------------|
| E2B Sandbox Manager | 1h | 0h | -1h |
| Process Manager | 0h | 30m | +30m |
| SDK Integration | 1.5h | 1h | -30m |
| Fastify API | 30m | 0h | -30m |
| Vue Dashboard | 1h | 0h | -1h |
| CLI Commands | 0h | 15m | +15m |
| **Total** | **6.5h** | **4.5h** | **-2h** |

---

## Success Criteria

- [ ] Director spawns specialists as child processes
- [ ] Message bus coordinates via MongoDB (visible in Compass)
- [ ] Checkpoints saved on signal/exit
- [ ] Ctrl+C creates checkpoint before exit
- [ ] Restart loads checkpoint and resumes
- [ ] MongoDB Compass shows all state changes in real-time
- [ ] Demo completes in < 3 minutes
- [ ] Kill/restart demo works 3/3 times

---

## Extra Buffer Time

With CLI approach, you have ~2.5 hours of buffer:
- **More debugging time** if things break
- **Polish demo script** to perfection
- **Practice pitch** more times
- **Record multiple backup videos**
- **Explore stretch features** if everything works

---

_CLI fallback dependency graph. Use if E2B validation fails._
