# Squad Lite — Exhaustive System Specification v2.0

**Version:** 2.0 (with E2B Integration)
**Date:** 2026-01-10
**Authors:** Danial, Shafan, Claude Sonnet 4.5

---

## Major Changes in v2.0

1. **Added S12: E2B Sandbox Layer** — Agents execute in secure cloud VMs instead of local filesystem
2. **Web-First Architecture** — Frontend can run entirely in browser with no local filesystem dependency
3. **Updated Dependency Graph** — E2B sandboxes are foundational for agent execution
4. **New Data Model** — `sandbox_tracking` collection for E2B state management
5. **Cost Analysis** — Free tier covers 153 hackathons ($0.65 per demo)

---

## Core Systems (Updated)

| System | Status | Description | E2B Dependency |
|--------|--------|-------------|----------------|
| S1: MongoDB Connection | ✅ Done | Foundation for all DB ops | — |
| S2: Zod Schemas | ✅ Done | Runtime type safety | — |
| S3: Agent Registry | ✅ Done | Track active agents | — |
| S4: Message Bus | ✅ Done | Inter-agent communication | — |
| S5: Checkpoints | ✅ Done | State persistence | — |
| S6: Task Management | 🔴 TODO | Work unit tracking | — |
| S7: Context Management | 🔴 TODO | Sessions, notifications, tokens | — |
| S8: Director Agent | 🔴 TODO | Orchestrator | ✅ Runs in E2B |
| S9: Specialist Agent | 🔴 TODO | Task executor | ✅ Runs in E2B |
| S10: SDK Integration | 🔴 TODO | Wire to Claude Agent SDK | ✅ Connects to E2B MCP |
| S11: CLI Entry Points | 🔴 TODO | Command line interface | — |
| **S12: E2B Sandbox Layer** | 🔴 **NEW** | **Secure code execution VMs** | — |

---

## S12: E2B Sandbox Layer (NEW)

### Purpose
Provide secure, isolated execution environments for agents in web-based Squad Lite deployments.

### Why E2B?
- **Web apps can't access filesystem** — E2B provides virtual filesystem
- **Security** — Untrusted AI code runs in isolated VMs
- **Fast** — 150ms startup, 1s resume
- **Cost-effective** — $100 free credits = 153 hackathons
- **MCP Gateway** — Host Squad Lite MCP + 200+ Docker tools

### Operations

```typescript
// Create sandbox for agent
const sandbox = await Sandbox.create({
  timeoutMs: 10 * 60 * 1000,
  metadata: {
    agentId: 'specialist-001',
    agentType: 'researcher',
    squadId: 'demo',
    taskId: 'task-123'
  },
  mcp: {
    'github/trysquad/squad-lite-mcp': {
      installCmd: 'npm install',
      runCmd: 'npm start'
    }
  }
});

// Execute commands
await sandbox.commands.run('npm install', {
  cwd: '/home/user/project',
  onStdout: (data) => streamToFrontend(data)
});

// File operations
await sandbox.files.write('/home/user/project/code.ts', code);
const output = await sandbox.files.read('/home/user/project/output.json');

// Pause/Resume (cost optimization)
await sandbox.pause();  // ~4s to hibernate
await sandbox.resume(); // ~1s to wake

// Cleanup
await sandbox.kill();
```

### MongoDB Integration

New collection: `sandbox_tracking`

```typescript
interface SandboxTracking {
  sandboxId: string;          // E2B ID
  agentId: string;            // Squad agent ID
  squadId: string;
  taskId: string | null;
  status: 'creating' | 'active' | 'paused' | 'resuming' | 'killed';
  lifecycle: {
    createdAt: Date;
    pausedAt: Date | null;
    resumedAt: Date | null;
    killedAt: Date | null;
    lastHeartbeat: Date;
  };
  resources: {
    cpuCount: number;
    memoryMB: number;
    timeoutMs: number;
  };
  costs: {
    estimatedCost: number;    // USD
    runtimeSeconds: number;
  };
}
```

### Status
🔴 Not yet built — Priority for Tier 1

---

## Updated Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        WEB APP (Browser)                                  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  React Frontend                                                      │  │
│  │  • Submit tasks                                                      │  │
│  │  │  • Real-time agent/sandbox visualization                          │  │
│  │  • Demo controls (spawn, kill, restart)                             │  │
│  └────────────────────┬───────────────────────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────────────────────┘
                        │ WebSocket + HTTP
                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    SQUAD LITE BACKEND (Fastify + Node.js)                │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  • Agent lifecycle management                                       │  │
│  │  • E2B sandbox orchestration                                        │  │
│  │  • MongoDB coordination                                             │  │
│  │  • WebSocket event streaming                                        │  │
│  └────────┬────────────────────────────┬──────────────────────────────┘  │
└───────────┼────────────────────────────┼─────────────────────────────────┘
            │                            │
            ▼                            ▼
┌────────────────────────┐    ┌────────────────────────────────────────────┐
│   MONGODB ATLAS        │    │         E2B SANDBOXES (Cloud VMs)         │
│                        │    │                                            │
│  • agents              │    │  ┌──────────────┐  ┌──────────────┐       │
│  • messages            │    │  │  Director    │  │ Specialist 1 │       │
│  • checkpoints         │    │  │  Sandbox     │  │ Sandbox      │       │
│  • tasks               │    │  │              │  │              │       │
│  • sandbox_tracking    │◀───┼──│ sandboxId:X  │  │ sandboxId:Y  │       │
│                        │    │  │ agentId:A    │  │ agentId:B    │       │
└────────────────────────┘    │  └──────┬───────┘  └──────┬───────┘       │
                              │         │                 │                │
                              │  ┌──────┴─────────────────┴───────┐       │
                              │  │      MCP Gateway (Docker)        │       │
                              │  │  • Squad Lite MCP Server         │       │
                              │  │  • checkInbox, sendMessage, ...  │       │
                              │  └──────────────────────────────────┘       │
                              └────────────────────────────────────────────┘
```

---

## Updated Dependency Graph

```
                    ┌─────────────────────┐
                    │  S1: MongoDB Conn   │
                    │  (FOUNDATION)       │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │  S2: Zod Schemas    │
                    │  (TYPE SAFETY)      │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ S3: Agent       │  │ S4: Message Bus │  │ S6: Task Mgmt   │
│ Registry        │  │ (Agent Mail)    │  │                 │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         │           ┌────────┴────────┐           │
         │           │                 │           │
         ▼           ▼                 │           │
┌─────────────────────────────┐        │           │
│ S5: Checkpoint System       │        │           │
│                             │        │           │
└────────────┬────────────────┘        │           │
             │                         │           │
             └────────────┬────────────┘           │
                          │                        │
                          ▼                        │
             ┌─────────────────────────┐           │
             │ S7: Context Management  │◀──────────┘
             │                         │
             └────────────┬────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
│ S12: E2B        │  │ S10: Claude  │  │ Behavior         │
│ Sandbox Layer   │  │ SDK Integration│ │ Contract Skills  │
│ (NEW)           │  │              │  │ (.claude/skills/)│
└────────┬────────┘  └──────┬───────┘  └────────┬─────────┘
         │                  │                   │
         └──────────────────┼───────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│ S8: Director Agent  │────────▶│ S9: Specialist      │
│ (runs in E2B)       │  spawns │ Agent (runs in E2B) │
└─────────┬───────────┘         └─────────┬───────────┘
          │                               │
          └───────────────┬───────────────┘
                          │
                          ▼
             ┌─────────────────────────┐
             │ S11: CLI Entry Points   │
             │ (Web API endpoints)     │
             └─────────────────────────┘
```

---

## Updated Implementation Tiers

### Tier 0: Foundation (✅ DONE — 100%)

| System | Files | Lines | Status |
|--------|-------|-------|--------|
| S1: MongoDB Connection | `src/db/mongo.ts` | 150 | ✅ |
| S2: Zod Schemas | `src/db/mongo.ts` | 80 | ✅ |
| S3: Agent Registry | `src/agents/base.ts` | 100 | ✅ |
| S4: Message Bus | `src/coordination/messages.ts` | 120 | ✅ |
| S5: Checkpoints | `src/coordination/checkpoints.ts` | 130 | ✅ |
| **Total** | **5 files** | **~580 lines** | **✅** |

### Tier 1: Core Systems (🔴 BUILD FIRST — Est. 3.5 hours)

| System | Est. Time | Owner | Dependencies | Output |
|--------|-----------|-------|--------------|--------|
| S6: Task Management | 30 min | — | S1, S2 | `src/coordination/tasks.ts` |
| S7: Context Management | 1 hour | — | S3, S4, S5 | `src/coordination/context.ts` |
| **S12: E2B Sandbox Layer** | **1 hour** | **—** | **S1, S2, S3** | **`src/sandbox/manager.ts`** |
| S10: SDK Integration | 1 hour | — | S7, S12 | `src/sdk/integration.ts` |

**Parallelization:**
- **Group A:** S6 + S12 (no dependencies between them)
- **Group B:** S7 (depends on S6 completion)
- **Group C:** S10 (depends on S7 + S12)

### Tier 2: Agent Implementation (🔴 BUILD SECOND — Est. 2.5 hours)

| System | Est. Time | Owner | Dependencies | Output |
|--------|-----------|-------|--------------|--------|
| S8: Director Agent | 1.5 hours | — | S6, S7, S10, S12 | `src/agents/director.ts` |
| S9: Specialist Agent | 1 hour | — | S6, S7, S10, S12 | `src/agents/specialist.ts` |

**Parallelization:**
- **Sequential** (Director creates Specialists, so test Director first)

### Tier 3: Polish & Demo (🔴 BUILD LAST — Est. 1 hour)

| System | Est. Time | Owner | Dependencies | Output |
|--------|-----------|-------|--------------|--------|
| S11: Web API Endpoints | 30 min | — | S8, S9 | `src/api/routes.ts` |
| Demo Script + Polish | 30 min | — | S11 | Demo flow working |

### Total Estimated Time: ~7 hours (Perfect for hackathon)

---

## Exhaustive Work Breakdown (Parallel Development)

### Work Package 1: Task Management (30 min)
**Owner:** Developer A
**Dependencies:** None (uses Tier 0)
**Output:** `src/coordination/tasks.ts`

**Functions to implement:**
```typescript
- createTask(title, description, parentTaskId?)
- assignTask(taskId, agentId)
- updateTaskStatus(taskId, status, result?)
- getTask(taskId)
- getAgentTasks(agentId)
- completeTask(taskId, result)
```

**Tests:**
- [ ] Create task with valid data
- [ ] Assign task to agent
- [ ] Update task status
- [ ] Complete task with result
- [ ] Get tasks by agent

---

### Work Package 2: E2B Sandbox Layer (1 hour)
**Owner:** Developer B
**Dependencies:** None (uses Tier 0)
**Output:** `src/sandbox/manager.ts`

**Functions to implement:**
```typescript
- createForAgent(agentId, config)
- executeCommand(sandboxId, cmd, opts)
- pause(sandboxId)
- resume(sandboxId)
- kill(sandboxId)
- syncToMongoDB(sandboxId, event)
- cleanupExpired()
```

**Setup:**
- [ ] Get E2B API key
- [ ] Install `@e2b/sdk` package
- [ ] Create `sandbox_tracking` collection
- [ ] Test sandbox creation
- [ ] Test pause/resume
- [ ] Test command execution with streaming

---

### Work Package 3: Context Management (1 hour)
**Owner:** Developer A (after WP1)
**Dependencies:** S6 (Task Management)
**Output:** `src/coordination/context.ts`

**Functions to implement:**
```typescript
- startSession(agentId)
- buildContextPacket(agentId)
- injectNotification(agentId, notification)
- trackTokens(agentId, tokensUsed)
- getSessionId(agentId)
- storeSessionId(agentId, sessionId)
```

**Tests:**
- [ ] Start session for agent
- [ ] Build context packet with checkpoint
- [ ] Inject notification
- [ ] Track cumulative tokens

---

### Work Package 4: Claude SDK Integration (1 hour)
**Owner:** Developer C
**Dependencies:** S7 (Context Management), S12 (E2B)
**Output:** `src/sdk/integration.ts`

**Functions to implement:**
```typescript
- runAgentQuery(agentId, prompt, options)
- connectToE2BMCP(sandboxId)
- loadSkills(skillPaths)
- handleAgentMessage(message)
- captureSessionId(messages)
```

**Setup:**
- [ ] Install `@anthropic-ai/claude-agent-sdk`
- [ ] Configure MCP with E2B gateway
- [ ] Test skills loading
- [ ] Test session capture/resume

---

### Work Package 5: Director Agent (1.5 hours)
**Owner:** Developer A + B
**Dependencies:** S6, S7, S10, S12
**Output:** `src/agents/director.ts`

**Functions to implement:**
```typescript
- start(taskFromHuman)
- decompose(task)
- spawnSpecialist(type, taskId)
- coordinateWork()
- aggregateResults()
- handleError(error)
```

**Tests:**
- [ ] Director receives task
- [ ] Decomposes into subtasks
- [ ] Spawns 2 specialists
- [ ] Coordinates via message bus
- [ ] Aggregates final result

---

### Work Package 6: Specialist Agent (1 hour)
**Owner:** Developer C
**Dependencies:** S6, S7, S10, S12
**Output:** `src/agents/specialist.ts`

**Functions to implement:**
```typescript
- start(specialization)
- pollForTasks()
- executeTask(task)
- reportResult(result)
- checkpoint()
- handleBlocker(blocker)
```

**Tests:**
- [ ] Specialist polls inbox
- [ ] Receives task from Director
- [ ] Executes (e.g., web search)
- [ ] Checkpoints progress
- [ ] Reports result back

---

### Work Package 7: Web API Endpoints (30 min)
**Owner:** Developer A
**Dependencies:** S8, S9
**Output:** `src/api/routes.ts`

**Endpoints to implement:**
```typescript
POST   /api/agents              # Spawn Director
POST   /api/agents/:id/task     # Submit task
GET    /api/agents/:id/status   # Get agent status
DELETE /api/agents/:id          # Kill agent

GET    /api/sandboxes           # List all sandboxes
GET    /api/sandboxes/:id/logs  # Stream logs

WebSocket /ws                   # Real-time events
```

---

### Work Package 8: Demo Polish (30 min)
**Owner:** All
**Dependencies:** S11
**Tasks:**
- [ ] Test kill/restart demo flow
- [ ] Verify MongoDB Compass shows updates
- [ ] Practice 3-minute pitch
- [ ] Record backup demo video
- [ ] Prepare failover plan

---

## Parallelization Strategy

### Hour 0-1: Parallel Group A
```
Developer A: Work Package 1 (Task Management)
Developer B: Work Package 2 (E2B Sandbox Layer)
Developer C: Set up environment, install dependencies
```

### Hour 1-2: Parallel Group B
```
Developer A: Work Package 3 (Context Management)
Developer B: Continue Work Package 2 (E2B) if not done
Developer C: Work Package 4 prep (SDK research)
```

### Hour 2-3: Parallel Group C
```
Developer A: Help with WP3 completion
Developer B: Help with WP2 completion
Developer C: Work Package 4 (SDK Integration)
```

### Hour 3-5: Tier 2 (Sequential)
```
Developers A + B: Work Package 5 (Director Agent)
Developer C: Work Package 6 (Specialist Agent)
```

### Hour 5-6: Tier 3
```
Developer A: Work Package 7 (API Endpoints)
All: Work Package 8 (Demo Polish)
```

### Hour 6-7: Buffer
```
All: Bug fixes, edge cases, backup plans
```

---

## Critical Path Analysis

**Longest Path (Critical):**
```
S1,S2 → S6 → S7 → S10 → S8 → S11
(Done)  (30m) (1h) (1h) (1.5h) (30m) = 4.5 hours
```

**Parallel Path:**
```
S1,S2 → S12 → (joins S10) → S9
(Done)  (1h)                (1h) = 2 hours
```

**Total with parallelization:** ~5.5 hours
**Buffer:** 1.5 hours
**Demo time:** 7 hours ✅

---

## Open Questions for Tomorrow

1. **Which developer owns which work package?**
2. **Do we build web frontend or just API + MongoDB Compass?**
3. **What task do agents collaborate on for demo?**
4. **E2B custom template or default?**

---

_Spec v2.0 complete. Ready for implementation._
