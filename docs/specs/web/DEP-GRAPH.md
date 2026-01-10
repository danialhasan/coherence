# Dependency Graph — Web Approach

**Approach:** E2B Sandboxes + Fastify API + Vue Dashboard
**Total Work:** 8 work packages, ~6.5 hours
**Critical Path:** 5 hours (with parallelization)

---

## Hour 0-1: E2B Validation Gate

**Before building anything, validate E2B.**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    HOUR 0-1: E2B VALIDATION (Both Devs)                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  0:00-0:15  Setup                                                       │
│  • Get E2B API key from https://e2b.dev/dashboard                       │
│  • Add to .env: E2B_API_KEY=xxx                                         │
│  • pnpm add @e2b/sdk                                                    │
│                                                                         │
│  0:15-0:30  Test 1: Sandbox Creation                                    │
│  • Create sandbox: Sandbox.create({ timeoutMs: 60000 })                 │
│  • ✅ PASS: Creates in < 5 seconds                                       │
│  • ❌ FAIL: Switch to CLI approach (docs/specs/cli/)                     │
│                                                                         │
│  0:30-0:40  Test 2: Command Execution                                   │
│  • Execute: sandbox.commands.run('echo "hello"')                        │
│  • ✅ PASS: Returns output                                               │
│  • ❌ FAIL: Switch to CLI approach                                       │
│                                                                         │
│  0:40-0:50  Test 3: Pause/Resume                                        │
│  • Pause + Resume + Execute command                                     │
│  • ✅ PASS: Resumes in < 3 seconds                                       │
│  • ❌ FAIL: Switch to CLI approach                                       │
│                                                                         │
│  0:50-1:00  DECISION: Continue with this spec or switch to CLI          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Run validation:** `pnpm tsx scripts/validate-e2b.ts`

---

## Visual Dependency Graph

```
TIER 0 (✅ DONE)                 TIER 1 (Hours 1-3)                    TIER 2 (Hours 3-5)              TIER 3 (Hours 5-6.5)
════════════════                 ══════════════════                    ══════════════════              ════════════════════

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
│ S4: Message  │───┼─────────▶│ WP2: E2B       │──────┤
│ Bus          │   │          │ Sandbox (1h)   │      │
└──────────────┘   │          └────────────────┘      │
                   │                                   │          ┌────────────────┐
┌──────────────┐   │          ┌────────────────┐      ├─────────▶│ WP5: Director  │────┐
│ S5: Checkpoint│──┼─────────▶│ WP3: Task      │──────┤          │ Agent (1.5h)   │    │
│ System       │   │          │ Management (30m)│      │          └────────────────┘    │
└──────────────┘   │          └────────────────┘      │                                 │
                   │                                   │          ┌────────────────┐    │
                   │          ┌────────────────┐      ├─────────▶│ WP6: Specialist│    │
                   └─────────▶│ WP4: Context   │──────┤          │ Agent (1h)     │    │
                              │ + SDK (1.5h)   │      │          └────────────────┘    │
                              └────────────────┘      │                                 │
                                                      │          ┌────────────────┐    │
                                                      └─────────▶│ WP7: Fastify   │◀───┤
                                                                 │ API (30m)      │    │
                                                                 └───────┬────────┘    │
                                                                         │             │
                                                                         ▼             │
                                                                 ┌────────────────┐    │
                                                                 │ WP8: Vue       │◀───┘
                                                                 │ Dashboard (1h) │
                                                                 └───────┬────────┘
                                                                         │
                                                                         ▼
                                                                 ┌────────────────┐
                                                                 │ WP9: Demo      │
                                                                 │ Polish (30m)   │
                                                                 └────────────────┘
```

---

## Parallel Execution Timeline

### Hour 1-2: Foundation (Parallel)

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│  DEVELOPER A (Danial)               │     │  DEVELOPER B (Shafan)               │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  WP1: Config Layer (15m)            │     │  WP2: E2B Sandbox Manager (1h)      │
│  • src/config.ts                    │     │  • src/sandbox/manager.ts           │
│  • Load env vars via config object  │     │  • createForAgent()                 │
│  • Export typed config              │     │  • execute()                        │
│                                     │     │  • pause() / resume()               │
│  WP3: Task Management (30m)         │     │  • kill()                           │
│  • src/coordination/tasks.ts        │     │  • syncToMongo()                    │
│  • createTask()                     │     │                                     │
│  • assignTask()                     │     │                                     │
│  • updateTaskStatus()               │     │                                     │
│  • completeTask()                   │     │                                     │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  Output: Config + Task system       │     │  Output: E2B integration working    │
└─────────────────────────────────────┘     └─────────────────────────────────────┘
```

### Hour 2-3: SDK Integration (Both)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BOTH DEVELOPERS (Pair Programming)                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  WP4: Context Management + Claude SDK (1.5h)                            │
│  • src/coordination/context.ts                                          │
│    - startSession()                                                     │
│    - buildContextPacket()                                               │
│    - injectNotification()                                               │
│    - trackTokens()                                                      │
│  • src/sdk/runner.ts                                                    │
│    - createClaudeRunner()                                               │
│    - run() with skill injection                                         │
│    - Handle tool calls                                                  │
│  • Integration test: Run Claude in E2B sandbox                          │
├─────────────────────────────────────────────────────────────────────────┤
│  Output: Agents can run Claude SDK with skills in E2B                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Hour 3-5: Agent Implementation (Parallel)

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│  DEVELOPER A                        │     │  DEVELOPER B                        │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  WP5: Director Agent (1.5h)         │     │  WP6: Specialist Agent (1h)         │
│  • src/agents/director.ts           │     │  • src/agents/specialist.ts         │
│  • start() - Initialize + sandbox   │     │  • start() - Initialize + sandbox   │
│  • decompose() - Task breakdown     │     │  • pollForTasks() - Check inbox     │
│  • spawnSpecialist() - Create agent │     │  • executeTask() - Research/write   │
│  • coordinateWork() - Message loop  │     │  • reportResult() - Send to Director│
│  • aggregateResults() - Final output│     │  • checkpoint() - Save state        │
│                                     │     │                                     │
│  WP7: Fastify API (30m)             │     │  Help with WP7 if needed            │
│  • src/api/server.ts                │     │                                     │
│  • POST /api/agents                 │     │                                     │
│  • DELETE /api/agents/:id           │     │                                     │
│  • WebSocket handler                │     │                                     │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  Output: Director + API working     │     │  Output: Specialist working         │
└─────────────────────────────────────┘     └─────────────────────────────────────┘
```

### Hour 5-6.5: Frontend + Polish (Both)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BOTH DEVELOPERS                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  WP8: Vue Dashboard (1h)                                                │
│  • web/src/App.vue - Main layout                                        │
│  • web/src/components/AgentCard.vue - Agent status                      │
│  • web/src/components/MessageFeed.vue - Real-time messages              │
│  • web/src/components/DemoControls.vue - Spawn/Kill buttons             │
│  • WebSocket connection for real-time updates                           │
│                                                                         │
│  WP9: Demo Polish (30m)                                                 │
│  • Test kill/restart flow 3 times                                       │
│  • Verify MongoDB Compass shows updates                                 │
│  • Practice 3-minute pitch                                              │
│  • Record backup video                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  Output: Demo ready                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Work Package Details

### WP1: Config Layer (15 min)

**File:** `src/config.ts`
**Owner:** Developer A

```typescript
// Implementation
import { z } from 'zod'

const ConfigSchema = z.object({
  mongodbUri: z.string().url(),
  mongodbDbName: z.string().default('squad-lite'),
  anthropicApiKey: z.string().startsWith('sk-ant-'),
  e2bApiKey: z.string(),
  port: z.number().default(3001),
})

export const config = ConfigSchema.parse({
  mongodbUri: process.env.MONGODB_URI,
  mongodbDbName: process.env.MONGODB_DB_NAME,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  e2bApiKey: process.env.E2B_API_KEY,
  port: Number(process.env.PORT) || 3001,
})

export type Config = z.infer<typeof ConfigSchema>
```

**Checklist:**
- [ ] Create config.ts with Zod schema
- [ ] Validate all env vars at startup
- [ ] Export typed config object

---

### WP2: E2B Sandbox Manager (1 hour)

**File:** `src/sandbox/manager.ts`
**Owner:** Developer B

**Functions:**
- `createForAgent(agentId, config)` - Create sandbox with metadata
- `execute(agentId, command, onStdout)` - Run command with streaming
- `pause(agentId)` - Hibernate sandbox
- `resume(agentId)` - Wake sandbox
- `kill(agentId)` - Terminate sandbox
- `syncToMongo(instance)` - Update MongoDB tracking

**Checklist:**
- [ ] Install @e2b/sdk
- [ ] Implement createForAgent with metadata
- [ ] Implement execute with stdout streaming
- [ ] Implement pause/resume
- [ ] Implement kill
- [ ] Create sandbox_tracking collection
- [ ] Test full lifecycle

---

### WP3: Task Management (30 min)

**File:** `src/coordination/tasks.ts`
**Owner:** Developer A

**Functions:**
- `createTask(title, description, parentTaskId?)` - Create work unit
- `assignTask(taskId, agentId)` - Assign to agent
- `updateTaskStatus(taskId, status, result?)` - Update status
- `getTask(taskId)` - Get single task
- `getAgentTasks(agentId)` - Get tasks by agent
- `completeTask(taskId, result)` - Mark complete with result

**Checklist:**
- [ ] Implement all 6 functions
- [ ] Validate with Zod
- [ ] Add indexes for efficient queries

---

### WP4: Context Management + Claude SDK (1.5 hours)

**Files:** `src/coordination/context.ts`, `src/sdk/runner.ts`
**Owner:** Both developers (pair programming)

**Context functions:**
- `startSession(agentId)` - Initialize session
- `buildContextPacket(agentId)` - Build context from checkpoint + messages
- `injectNotification(agentId, notification)` - Add notification to context
- `trackTokens(agentId, tokensUsed)` - Track usage

**SDK functions:**
- `createClaudeRunner()` - Factory for runner
- `run(config, onMessage)` - Execute Claude with skills
- Skill injection via system prompt

**Checklist:**
- [ ] Implement context management
- [ ] Install @anthropic-ai/sdk
- [ ] Implement Claude runner with skill injection
- [ ] Test end-to-end: Agent query in E2B

---

### WP5: Director Agent (1.5 hours)

**File:** `src/agents/director.ts`
**Owner:** Developer A

**Functions:**
- `start(taskFromHuman)` - Initialize and process task
- `decompose(task)` - Break into subtasks
- `spawnSpecialist(type, taskId)` - Create specialist + sandbox
- `coordinateWork()` - Message loop
- `aggregateResults()` - Combine specialist outputs

**Checklist:**
- [ ] Implement Director workflow
- [ ] Integrate with E2B sandbox manager
- [ ] Test spawning 2 specialists
- [ ] Test message coordination
- [ ] Test checkpoint/resume

---

### WP6: Specialist Agent (1 hour)

**File:** `src/agents/specialist.ts`
**Owner:** Developer B

**Functions:**
- `start(specialization)` - Initialize specialist
- `pollForTasks()` - Check inbox for tasks
- `executeTask(task)` - Run research/analysis
- `reportResult(task, result)` - Send result to Director
- `checkpoint()` - Save state

**Checklist:**
- [ ] Implement Specialist workflow
- [ ] Integrate with E2B sandbox manager
- [ ] Test receiving task from Director
- [ ] Test checkpoint/resume

---

### WP7: Fastify API (30 min)

**File:** `src/api/server.ts`
**Owner:** Developer A

**Endpoints:**
```
POST   /api/agents           - Spawn Director
POST   /api/agents/:id/task  - Submit task
GET    /api/agents/:id       - Get status
DELETE /api/agents/:id       - Kill agent
POST   /api/agents/:id/restart - Restart from checkpoint

WebSocket /ws                - Real-time events
```

**Checklist:**
- [ ] Set up Fastify with CORS
- [ ] Implement agent routes
- [ ] Implement WebSocket handler
- [ ] Test with curl

---

### WP8: Vue Dashboard (1 hour)

**Files:** `web/src/App.vue`, components
**Owner:** Both developers

**Components:**
- `App.vue` - Main layout
- `AgentCard.vue` - Shows agent status
- `MessageFeed.vue` - Real-time message stream
- `DemoControls.vue` - Spawn/Kill/Restart buttons

**Checklist:**
- [ ] Set up Vue 3 + Vite project
- [ ] Implement basic layout
- [ ] Add WebSocket connection
- [ ] Implement agent cards
- [ ] Add demo controls
- [ ] Test with backend

---

### WP9: Demo Polish (30 min)

**No code, just testing**

**Checklist:**
- [ ] Run full demo 3 times
- [ ] Test kill/restart flow
- [ ] Verify MongoDB Compass shows updates
- [ ] Practice 3-minute pitch
- [ ] Record backup video (1 min)
- [ ] Set up split-screen for presentation

---

## Critical Path

```
WP1 (15m) → WP3 (30m) → WP4 (1.5h) → WP5 (1.5h) → WP7 (30m) → WP8 (1h) → WP9 (30m)
            ↑
WP2 (1h) ───┘ (joins at WP4)
            ↑
            └─── WP6 (1h) parallel with WP5
```

**Total critical path:** ~5.5 hours
**Total with buffer:** ~6.5 hours

---

## Success Criteria

- [ ] E2B sandboxes create/kill/restart reliably
- [ ] Director spawns 2 specialists in parallel
- [ ] Message bus shows coordination in MongoDB Compass
- [ ] Checkpoints created every 5 minutes
- [ ] Kill specialist → Checkpoint visible → Restart → Resume works
- [ ] Vue dashboard shows real-time status
- [ ] Demo completes in < 3 minutes
- [ ] Kill/restart demo works 3/3 times

---

_Web approach dependency graph. See ../cli/ for fallback approach._
