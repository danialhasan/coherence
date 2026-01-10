# Dependency Graph — Exhaustive Work Breakdown

**Purpose:** Enable parallel development by Danial + Shafan
**Total Work:** 8 work packages, ~7 hours estimated
**Critical Path:** 4.5 hours (with parallelization)

---

## Visual Dependency Graph

```
TIER 0 (✅ DONE)                    TIER 1 (BUILD FIRST)                 TIER 2 (BUILD SECOND)              TIER 3 (BUILD LAST)
════════════════                    ════════════════════                 ══════════════════════              ═══════════════════

┌──────────────┐
│ S1: MongoDB  │───────┐
│ Connection   │       │
└──────────────┘       │
                       │
┌──────────────┐       │
│ S2: Zod      │───────┤
│ Schemas      │       │
└──────────────┘       │
                       │
┌──────────────┐       │           ┌──────────────┐
│ S3: Agent    │───────┼──────────▶│ WP1: Task    │────────┐
│ Registry     │       │           │ Management   │        │
└──────────────┘       │           │ (30 min)     │        │
                       │           └──────────────┘        │
┌──────────────┐       │                                   │          ┌──────────────┐
│ S4: Message  │───────┤                                   ├─────────▶│ WP3: Context │────────┐
│ Bus          │       │                                   │          │ Management   │        │
└──────────────┘       │                                   │          │ (1 hour)     │        │
                       │                                   │          └──────────────┘        │
┌──────────────┐       │           ┌──────────────┐        │                                  │
│ S5: Checkpoint│──────┼──────────▶│ WP2: E2B     │────────┤                                  │          ┌──────────────┐
│ System       │       │           │ Sandbox Layer│        │                                  ├─────────▶│ WP5: Director│───┐
└──────────────┘       │           │ (1 hour)     │        │                                  │          │ Agent        │   │
                       │           └──────────────┘        │          ┌──────────────┐        │          │ (1.5 hours)  │   │
                       │                                   └─────────▶│ WP4: SDK     │────────┤          └──────────────┘   │
                       │                                              │ Integration  │        │                             │
                       │                                              │ (1 hour)     │────────┤          ┌──────────────┐   │
                       │                                              └──────────────┘        └─────────▶│ WP6: Specialist   │
                       │                                                                                 │ Agent        │   │
                       │                                                                                 │ (1 hour)     │   │
                       │                                                                                 └──────────────┘   │
                       │                                                                                                    │
                       │                                                                                                    │
                       │                                                                                 ┌──────────────┐   │
                       │                                                                                 │ WP7: Web API │◀──┤
                       │                                                                                 │ (30 min)     │   │
                       │                                                                                 └──────┬───────┘   │
                       │                                                                                        │           │
                       │                                                                                        ▼           │
                       │                                                                                 ┌──────────────┐   │
                       │                                                                                 │ WP8: Demo    │◀──┘
                       │                                                                                 │ Polish       │
                       │                                                                                 │ (30 min)     │
                       │                                                                                 └──────────────┘
```

---

## Parallel Execution Windows

### Window 1 (0:00 - 0:30) — 2 Parallel Tracks

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│  TRACK A: Developer A (Danial)      │     │  TRACK B: Developer B (Shafan)      │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  WP1: Task Management               │     │  WP2: E2B Sandbox Layer (start)     │
│  ────────────────────────────────   │     │  ────────────────────────────────   │
│  • src/coordination/tasks.ts        │     │  • Get E2B API key                  │
│  • createTask()                     │     │  • Install @e2b/sdk                 │
│  • assignTask()                     │     │  • src/sandbox/manager.ts           │
│  • updateTaskStatus()               │     │  • createForAgent() stub            │
│  • completeTask()                   │     │  • Test sandbox creation            │
│  ────────────────────────────────   │     │  ────────────────────────────────   │
│  Output: ✅ Task Mgmt working       │     │  Output: 🟡 E2B connection works    │
└─────────────────────────────────────┘     └─────────────────────────────────────┘
```

### Window 2 (0:30 - 1:30) — 2 Parallel Tracks

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│  TRACK A: Developer A               │     │  TRACK B: Developer B               │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  WP3: Context Management            │     │  WP2: E2B Sandbox Layer (cont'd)    │
│  ────────────────────────────────   │     │  ────────────────────────────────   │
│  • src/coordination/context.ts      │     │  • executeCommand() with streaming  │
│  • startSession()                   │     │  • pause() / resume()               │
│  • buildContextPacket()             │     │  • syncToMongoDB()                  │
│  • injectNotification()             │     │  • Test pause/resume flow           │
│  • trackTokens()                    │     │  • sandbox_tracking collection      │
│  ────────────────────────────────   │     │  ────────────────────────────────   │
│  Output: ✅ Context Mgmt working    │     │  Output: ✅ E2B fully integrated    │
└─────────────────────────────────────┘     └─────────────────────────────────────┘
```

### Window 3 (1:30 - 2:30) — 1 Track (Blocking)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TRACK A+B: Both Developers (Pair Programming)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  WP4: Claude SDK Integration                                            │
│  ────────────────────────────────────────────────────────────────────   │
│  • src/sdk/integration.ts                                               │
│  • runAgentQuery() — Connect Claude SDK to E2B MCP                      │
│  • connectToE2BMCP() — Get gateway URL + token                          │
│  • loadSkills() — Load behavior contracts                               │
│  • captureSessionId() — Extract from init message                       │
│  • Test end-to-end: Spawn agent → Execute in E2B → Checkpoint          │
│  ────────────────────────────────────────────────────────────────────   │
│  Output: ✅ Agents can run Claude SDK in E2B sandboxes                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Window 4 (2:30 - 4:00) — 2 Parallel Tracks

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│  TRACK A: Developer A               │     │  TRACK B: Developer B               │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│  WP5: Director Agent                │     │  WP6: Specialist Agent              │
│  ────────────────────────────────   │     │  ────────────────────────────────   │
│  • src/agents/director.ts           │     │  • src/agents/specialist.ts         │
│  • Task decomposition logic         │     │  • pollForTasks()                   │
│  • spawnSpecialist() wrapper        │     │  • executeTask() implementations:   │
│  • Message coordination loop        │     │    - researcher: WebSearch          │
│  • Result aggregation               │     │    - writer: content creation       │
│  • Checkpoint Director state        │     │    - analyst: code analysis         │
│  • Integrate with skills            │     │  • reportResult()                   │
│  ────────────────────────────────   │     │  • Checkpoint specialist state      │
│  Output: ✅ Director orchestrates   │     │  Output: ✅ Specialists execute     │
└─────────────────────────────────────┘     └─────────────────────────────────────┘
```

### Window 5 (4:00 - 4:30) — Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TRACK A+B: Both Developers                                              │
├─────────────────────────────────────────────────────────────────────────┤
│  WP7: Web API Endpoints                                                  │
│  ────────────────────────────────────────────────────────────────────   │
│  • src/api/routes.ts                                                     │
│  • POST /api/agents (spawn Director)                                     │
│  • POST /api/agents/:id/task (submit task)                               │
│  • WebSocket handler for real-time events                                │
│  • Test end-to-end: API → Director → Specialists → Result               │
│  ────────────────────────────────────────────────────────────────────   │
│  Output: ✅ API working, can trigger from web/curl                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Window 6 (4:30 - 5:00) — Demo Prep

```
┌─────────────────────────────────────────────────────────────────────────┐
│  WP8: Demo Polish (All)                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  • Practice kill/restart demo                                            │
│  • Verify MongoDB Compass shows real-time updates                        │
│  • Test fail-over scenarios                                              │
│  • Record 1-minute backup demo video                                     │
│  • Prepare pitch script                                                  │
│  • Set up split-screen for presentation                                  │
│  ────────────────────────────────────────────────────────────────────   │
│  Output: ✅ Demo ready, pitch practiced                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Work Package Details (Exhaustive)

### WP1: Task Management (30 min — Developer A)

**File:** `src/coordination/tasks.ts`
**Dependencies:** S1, S2
**Lines of Code:** ~150

**Implementation Checklist:**
- [ ] Import MongoDB connection and schemas
- [ ] Implement `createTask(input: CreateTaskInput)`
  - [ ] Validate input with Zod
  - [ ] Generate UUID
  - [ ] Insert into `tasks` collection
  - [ ] Return task object
- [ ] Implement `assignTask(taskId, agentId)`
  - [ ] Find task by ID
  - [ ] Update `assignedTo` and `status` = 'assigned'
  - [ ] Update `updatedAt`
- [ ] Implement `updateTaskStatus(taskId, status, result?)`
  - [ ] Validate status transition
  - [ ] Update task record
  - [ ] If completed, store result
- [ ] Implement `getTask(taskId)`
- [ ] Implement `getAgentTasks(agentId)`
- [ ] Implement `completeTask(taskId, result)`

**Tests to Write:**
```typescript
describe('Task Management', () => {
  it('creates task with valid input')
  it('assigns task to agent')
  it('updates task status')
  it('completes task with result')
  it('gets tasks by agent')
  it('rejects invalid status transitions')
})
```

**Acceptance:**
- All 6 tests pass
- TypeScript compiles with no errors
- No linter warnings

---

### WP2: E2B Sandbox Layer (1 hour — Developer B)

**File:** `src/sandbox/manager.ts`
**Dependencies:** S1, S2, S3
**Lines of Code:** ~250
**External:** E2B API key required

**Implementation Checklist:**
- [ ] Set up E2B account at https://e2b.dev/dashboard
- [ ] Get API key, store in `.env` as `E2B_API_KEY`
- [ ] Install `@e2b/sdk` package: `pnpm add @e2b/sdk`
- [ ] Create `SandboxManager` class/module:
  - [ ] `createForAgent(agentId, config)` — Create + track in MongoDB
  - [ ] `executeCommand(sandboxId, cmd, opts)` — Run command with streaming
  - [ ] `pause(sandboxId)` — Hibernate sandbox
  - [ ] `resume(sandboxId)` — Wake sandbox
  - [ ] `kill(sandboxId)` — Terminate sandbox
  - [ ] `syncToMongoDB(sandboxId, event)` — Update tracking
  - [ ] `cleanupExpired()` — Kill idle sandboxes
- [ ] Create `sandbox_tracking` collection with indexes
- [ ] Update `Agent` schema to include `sandboxId` and `sandboxStatus`

**Tests to Write:**
```typescript
describe('E2B Sandbox Manager', () => {
  it('creates sandbox for agent with metadata')
  it('executes command and streams output')
  it('pauses sandbox and updates MongoDB')
  it('resumes sandbox from paused state')
  it('kills sandbox and marks in MongoDB')
  it('syncs lifecycle events to MongoDB')
})
```

**Manual Verification:**
- [ ] Sandbox appears in E2B dashboard
- [ ] Can see sandbox in MongoDB Compass `sandbox_tracking`
- [ ] Pause/resume works (check E2B dashboard)
- [ ] Kill works (sandbox disappears)

**Acceptance:**
- All 6 tests pass
- Can create sandbox and execute `echo "hello"` successfully
- Pause/resume preserves state

---

### WP3: Context Management (1 hour — Developer A)

**File:** `src/coordination/context.ts`
**Dependencies:** S6 (WP1), S5, S4
**Lines of Code:** ~200

**Implementation Checklist:**
- [ ] Implement `startSession(agentId)`
  - [ ] Create session record (if needed)
  - [ ] Initialize token counter
  - [ ] Return session metadata
- [ ] Implement `buildContextPacket(agentId)`
  - [ ] Load latest checkpoint (if exists)
  - [ ] Get unread message notifications
  - [ ] Get current task
  - [ ] Get resume pointer
  - [ ] Build context string
  - [ ] Return packet
- [ ] Implement `injectNotification(agentId, notification)`
  - [ ] Format as `[MAIL] From: X | Type: Y | ID: Z`
  - [ ] Append to agent's context queue
- [ ] Implement `trackTokens(agentId, tokensUsed)`
  - [ ] Update cumulative tokens for agent
  - [ ] Check thresholds (70%, 90%)
  - [ ] Trigger checkpoint if needed
- [ ] Implement `getSessionId(agentId)` and `storeSessionId(agentId, sessionId)`

**Tests to Write:**
```typescript
describe('Context Management', () => {
  it('starts session for agent')
  it('builds context packet with checkpoint')
  it('builds context packet without checkpoint')
  it('injects notification into context')
  it('tracks cumulative tokens')
  it('triggers checkpoint at 70% threshold')
})
```

**Acceptance:**
- All 6 tests pass
- Context packet includes checkpoint summary when resuming
- Notifications properly formatted

---

### WP4: Claude SDK Integration (1 hour — Both Developers)

**File:** `src/sdk/integration.ts`
**Dependencies:** S7 (WP3), S12 (WP2)
**Lines of Code:** ~300
**External:** Anthropic API key required

**Implementation Checklist:**
- [ ] Install `@anthropic-ai/claude-agent-sdk`: `pnpm add @anthropic-ai/claude-agent-sdk`
- [ ] Implement `runAgentQuery(agentId, prompt, options)`
  - [ ] Build context packet via WP3
  - [ ] Connect to E2B MCP gateway via WP2
  - [ ] Configure SDK options (tools, skills, MCP)
  - [ ] Capture session ID from init message
  - [ ] Stream messages to frontend via WebSocket
  - [ ] Track tokens
  - [ ] Handle checkpoints
- [ ] Implement `connectToE2BMCP(sandboxId)`
  - [ ] Get MCP URL and token from E2B
  - [ ] Return MCP config for SDK
- [ ] Implement `loadSkills(skillPaths)`
  - [ ] Configure `settingSources: ['project']`
  - [ ] Enable Skill tool
  - [ ] Return SDK options
- [ ] Implement `handleAgentMessage(message)`
  - [ ] Parse message type
  - [ ] Route to appropriate handler
  - [ ] Emit WebSocket events
- [ ] Implement `captureSessionId(messages)`
  - [ ] Find init message
  - [ ] Extract session_id
  - [ ] Store in agent record

**Tests to Write:**
```typescript
describe('Claude SDK Integration', () => {
  it('runs agent query with E2B MCP connection')
  it('captures session ID on init')
  it('resumes from session ID')
  it('loads skills from .claude/skills/')
  it('handles tool use messages')
  it('handles result messages')
})
```

**Manual Verification:**
- [ ] Agent can execute query and get response
- [ ] MCP tools are available (checkInbox, sendMessage)
- [ ] Skills are loaded and invocable
- [ ] Session resume works

**Acceptance:**
- All 6 tests pass
- End-to-end: Query → E2B → MCP tools → Response
- Can resume session with full context

---

### WP5: Director Agent (1.5 hours — Developer A)

**File:** `src/agents/director.ts`
**Dependencies:** S6, S7, S10, S12 (WP1, WP3, WP4, WP2)
**Lines of Code:** ~400

**Implementation Checklist:**
- [ ] Implement `start(taskFromHuman)`
  - [ ] Initialize Director (registerAgent, createSandbox)
  - [ ] Check for checkpoint (resume if exists)
  - [ ] Load director-protocol skill
  - [ ] Process task
- [ ] Implement `decompose(task)`
  - [ ] Analyze task complexity
  - [ ] Identify required specialist types
  - [ ] Create subtasks via createTask()
  - [ ] Build dependency graph
  - [ ] Return tier structure
- [ ] Implement `spawnSpecialist(type, taskId)`
  - [ ] Create specialist agent record
  - [ ] Create E2B sandbox for specialist
  - [ ] Load specialist skill (researcher/writer/analyst)
  - [ ] Assign task via assignTask()
  - [ ] Send task message via sendMessage()
  - [ ] Return specialist ID
- [ ] Implement `coordinateWork()`
  - [ ] Poll inbox every 30s
  - [ ] Process result messages
  - [ ] Update task statuses
  - [ ] Assign next tier when dependencies clear
  - [ ] Checkpoint coordination state
- [ ] Implement `aggregateResults(taskResults)`
  - [ ] Collect all completed task results
  - [ ] Synthesize into final output
  - [ ] Format for human
- [ ] Implement `handleError(error)`
  - [ ] Log error
  - [ ] Attempt recovery (reassign?)
  - [ ] Escalate to human if needed

**Tests to Write:**
```typescript
describe('Director Agent', () => {
  it('decomposes complex task into subtasks')
  it('spawns specialist with correct type')
  it('coordinates work via message bus')
  it('aggregates results from specialists')
  it('checkpoints state at phase transitions')
  it('resumes from checkpoint')
})
```

**Manual Verification:**
- [ ] Director spawns 2 specialists
- [ ] Messages visible in MongoDB Compass
- [ ] Specialists receive tasks
- [ ] Director aggregates results
- [ ] Can kill and restart Director (resumes)

**Acceptance:**
- All 6 tests pass
- End-to-end demo works: Task → Decompose → Spawn → Coordinate → Aggregate

---

### WP6: Specialist Agent (1 hour — Developer B)

**File:** `src/agents/specialist.ts`
**Dependencies:** S6, S7, S10, S12 (WP1, WP3, WP4, WP2)
**Lines of Code:** ~350

**Implementation Checklist:**
- [ ] Implement `start(specialization)`
  - [ ] Initialize Specialist (registerAgent, createSandbox)
  - [ ] Check for checkpoint (resume if exists)
  - [ ] Load specialist skill (researcher/writer/analyst)
  - [ ] Enter work loop
- [ ] Implement `pollForTasks()`
  - [ ] checkInbox() every 30s
  - [ ] Process task messages
  - [ ] Mark messages as read
  - [ ] Return task or null
- [ ] Implement `executeTask(task)` with specialization logic:
  - [ ] **Researcher:** WebSearch, WebFetch, synthesize
  - [ ] **Writer:** Read sources, write content, format
  - [ ] **Analyst:** Read code, analyze, report
  - [ ] Checkpoint progress every 5 minutes
  - [ ] Update task status: in_progress
- [ ] Implement `reportResult(task, result)`
  - [ ] Complete task via completeTask()
  - [ ] Send result message to Director
  - [ ] Checkpoint final state
- [ ] Implement `checkpoint()` wrapper
  - [ ] Build summary from current work
  - [ ] Build resume pointer
  - [ ] Call checkpoint() from base
- [ ] Implement `handleBlocker(blocker)`
  - [ ] Send error message to Director
  - [ ] Update task status: blocked
  - [ ] Wait for reassignment or help

**Tests to Write:**
```typescript
describe('Specialist Agent', () => {
  it('polls inbox and receives task')
  it('executes research task (mock WebSearch)')
  it('executes writing task')
  it('executes analysis task')
  it('reports result to Director')
  it('checkpoints progress periodically')
  it('resumes from checkpoint')
})
```

**Manual Verification:**
- [ ] Specialist receives task from Director
- [ ] Specialist executes (web search working)
- [ ] Checkpoint created in MongoDB
- [ ] Can kill and restart Specialist (resumes)
- [ ] Result sent back to Director

**Acceptance:**
- All 7 tests pass
- End-to-end: Receive task → Execute → Checkpoint → Report

---

### WP7: Web API Endpoints (30 min — Developer A)

**File:** `src/api/routes.ts`
**Dependencies:** S8, S9 (WP5, WP6)
**Lines of Code:** ~200

**Implementation Checklist:**
- [ ] Set up Fastify server
- [ ] Implement `POST /api/agents`
  - [ ] Spawn Director agent
  - [ ] Return agent ID and status
- [ ] Implement `POST /api/agents/:id/task`
  - [ ] Submit task to Director
  - [ ] Trigger decomposition
  - [ ] Return task ID
- [ ] Implement `GET /api/agents/:id/status`
  - [ ] Query agent record
  - [ ] Query sandbox status
  - [ ] Return current state
- [ ] Implement `DELETE /api/agents/:id`
  - [ ] Kill agent
  - [ ] Kill sandbox
  - [ ] Update MongoDB
- [ ] Implement WebSocket handler
  - [ ] On connect: Subscribe to agent events
  - [ ] Stream sandbox stdout/stderr
  - [ ] Stream MongoDB changes (messages, checkpoints)
- [ ] Add CORS middleware for frontend
- [ ] Add error handling middleware

**Tests to Write:**
```typescript
describe('Web API', () => {
  it('POST /api/agents creates Director')
  it('POST /api/agents/:id/task submits task')
  it('GET /api/agents/:id/status returns state')
  it('DELETE /api/agents/:id kills agent')
  it('WebSocket streams events')
})
```

**Acceptance:**
- All 5 tests pass
- Can curl API and get responses
- WebSocket streams working

---

### WP8: Demo Polish (30 min — All Developers)

**No code, just testing and practice**

**Checklist:**
- [ ] Run full demo end-to-end 3 times
- [ ] Time each section (should be < 3 min total)
- [ ] Verify MongoDB Compass shows:
  - [ ] `agents` collection updating
  - [ ] `messages` flowing in real-time
  - [ ] `checkpoints` created
  - [ ] `sandbox_tracking` lifecycle
- [ ] Test kill/restart demo:
  - [ ] Kill Specialist mid-task (Ctrl+C or API)
  - [ ] Show checkpoint in Compass
  - [ ] Restart Specialist
  - [ ] Verify it resumes from checkpoint
- [ ] Record backup demo video (1 min)
  - [ ] In case live demo fails
  - [ ] Upload to YouTube/Loom
- [ ] Practice pitch (3 min)
  - [ ] Problem statement
  - [ ] Solution (2 features)
  - [ ] Live demo (kill/restart)
  - [ ] Impact and next steps
- [ ] Prepare failover plan:
  - [ ] Pre-recorded video ready
  - [ ] Screenshots of working demo
  - [ ] Backup laptop with same setup

**Acceptance:**
- Demo runs smoothly 3/3 times
- Kill/restart works reliably
- Pitch fits in 3 minutes
- Backup video uploaded

---

## Critical Path Timeline

```
0:00                1:00                2:00                3:00                4:00                5:00
  │                   │                   │                   │                   │                   │
  ▼                   ▼                   ▼                   ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ WP1 (30m)  │ WP3 (1h)        │ WP4 (1h)        │ WP5 (1.5h)              │ WP7 │ WP8 │ JUDGING       │
│            │                 │  (BLOCKING)     │                         │(30m)│(30m)│               │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘

Parallel Track:
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ WP2 (1h)            │                 │                 │ WP6 (1h)                │                   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Critical Path:** WP1 → WP3 → WP4 → WP5 → WP7 → WP8 = **4.5 hours**
**Parallel Path:** WP2 → WP6 = **2 hours**
**Total with Buffer:** **5.5 hours**

---

## Blocker Detection

### Red Flags to Watch

| Blocker | Impact | Mitigation |
|---------|--------|------------|
| E2B API key doesn't work | Can't build WP2 | Get key early, test immediately |
| MongoDB Atlas timeout | Can't connect | Test connection before hackathon |
| Claude SDK MCP connection fails | Can't wire agents | Fallback to local MCP |
| Skills don't load | Agents don't know protocol | Test with simple skill first |
| Sandbox creation too slow | Demo hangs | Use sandbox pool (pre-warm) |
| WebSocket doesn't stream | No real-time demo | Use HTTP polling fallback |

### Escalation Protocol

If blocked for > 15 minutes:
1. Document blocker in Linear
2. Switch to parallel work package
3. Return to blocker with fresh perspective
4. If still blocked after 30 min → Escalate to team discussion

---

## Work Assignment Recommendations

### Option A: Divide by Layer

```
Developer A (Danial): Backend (WP1, WP3, WP5, WP7)
Developer B (Shafan): Infrastructure (WP2, WP4, WP6)
Both: WP8 (Demo Polish)
```

### Option B: Divide by Feature

```
Developer A: Agent Coordination (WP1, WP5, WP6)
Developer B: Execution Layer (WP2, WP3, WP4, WP7)
Both: WP8
```

### Option C: Pair Programming (Recommended)

```
Both on critical path items:
  - WP4 (SDK Integration) — Complex, benefits from 2 brains
  - WP5 (Director) — Core demo logic
  - WP8 (Demo Polish) — Practice together

Solo on independent items:
  - WP1, WP2, WP3, WP6, WP7 — Clear specs, can parallelize
```

---

## Testing Strategy

### Backend (Auto-Verifiable)

```bash
# Run after each work package
pnpm test                    # All unit tests
pnpm typecheck               # TypeScript compilation
pnpm lint                    # ESLint
```

**Gate:** All tests must pass before moving to dependent work packages.

### Integration (Human-Verifiable)

```bash
# Run after Tier 2 complete
pnpm run director             # Start Director
# Observe MongoDB Compass for real-time updates

# Kill/restart test
Ctrl+C                        # Kill agent
pnpm run director --resume    # Should resume from checkpoint
```

**Gate:** Human confirms demo flow works.

---

## Success Criteria (Demo Ready)

- [ ] Director spawns 2+ Specialists in E2B sandboxes
- [ ] Messages flow through MongoDB (visible in Compass)
- [ ] Specialist executes task (web search or analysis)
- [ ] Checkpoints created in MongoDB
- [ ] Kill Specialist → Checkpoint exists → Restart → Resumes
- [ ] Demo completes in < 3 minutes
- [ ] Backup video recorded
- [ ] Pitch practiced
- [ ] Submitted before 5:00 PM

---

_Dependency graph complete. Ready for parallel development._
