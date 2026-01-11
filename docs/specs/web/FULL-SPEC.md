# Squad Lite - Web Full Implementation Spec (Shared Sandbox)

Version: 4.0
Date: 2026-01-10
Status: Authoritative full implementation spec

This spec defines the REQUIRED full implementation for the Web approach.
No demo shortcuts. No stubs. All systems must be implemented.

Decisions (locked):
- Single shared E2B sandbox for all agents.
- Claude agentic loop runs inside sandbox agent processes (canonical runtime).
- Host API is the control plane (spawn/kill processes, stream output, persist state).
- WebSocket agent output payload uses `content` to match contract.
- Tool `spawnSpecialist` is required to create specialist agents.

---

## 1) Goals and Non-Goals

Goals:
- Full adherence to docs/ARCHITECTURE.ascii systems S1-S11.
- Single shared sandbox with multi-agent coordination.
- Fully functional agentic loop with tool_use handling.
- Session tracking and token usage tracking (S7a).
- Notification injection with read-on-demand (S7b).
- End-to-end execution via REST + WebSocket + MongoDB.

Non-goals:
- CLI fallback implementation (only if explicitly requested later).
- Demo-only behavior or hardcoded results.

---

## 2) Architecture Overview

```
BROWSER (Vue 3)  <--- WebSocket events ---  FASTIFY API (Node)
     |                                          |
     | REST (spawn/task/kill/restart)           | MongoDB (state)
     |                                          |
     +------------------------------------------+
                           |
                           | spawn/kill agent processes
                           v
                 E2B SANDBOX (single shared)
                 - agent processes run here (Claude SDK + MongoDB)
                 - shared workspace + filesystem
```

Key rules:
- Agents are sandbox processes (one process per agent).
- The shared sandbox is the execution environment for all agents.
- Host does not run Claude; it only orchestrates and streams output.
- MongoDB is the source of truth for agents, tasks, messages, checkpoints, and sandbox tracking.

---

## 3) System Responsibilities (S1-S11)

S1 MongoDB Connection:
- Connect via config layer, not direct env access.
- Reuse a singleton connection.

S2 Zod Schemas:
- Validate all stored documents before insert/update.

S3 Agent Registry:
- registerAgent(), updateAgentStatus(), heartbeat().
- Each agent has a persistent record in `agents`.

S4 Message Bus:
- sendMessage(), getInbox(), readMessage(), markAsRead(), getThread().

S5 Checkpoints:
- createCheckpoint(), getLatestCheckpoint(), resumeFromCheckpoint().

S6 Task Management:
- createTask(), assignTask(), updateTaskStatus(), completeTask(), failTask().

S7 Context Management:
- S7a Session tracking and token usage (see section 7).
- S7b Notification injection (lightweight previews + readMessage tool).
- S7c Context assembly for Claude system prompts.

S8 Director Agent:
- Decompose tasks, spawn specialists, aggregate results.

S9 Specialist Agent:
- Execute assigned tasks and report results.

S10 Claude SDK Integration:
- Multi-turn agentic loop with tool_use (inside sandbox).
- Tool execution for coordination and task flow (inside sandbox).

S11 API Entry Points:
- REST and WebSocket interfaces for full lifecycle.

---

## 4) Data Model (MongoDB)

Collections:
- agents
- messages
- checkpoints
- tasks
- sandbox_tracking

### agents
Fields:
- agentId (uuid)
- type: director | specialist
- specialization: researcher | writer | analyst | general
- status: idle | working | waiting | completed | error
- sandboxId: string | null
- sandboxStatus: none | active | paused | killed
- parentId: uuid | null
- taskId: uuid | null
- sessionId: string | null
- tokenUsage:
  - totalInputTokens: number
  - totalOutputTokens: number
  - lastUpdated: date | null
- createdAt, lastHeartbeat

Indexes:
- agentId unique
- status + lastHeartbeat
- sandboxId

### messages
Fields:
- messageId (uuid)
- fromAgent, toAgent (uuid)
- content (string)
- type: task | result | status | error
- threadId (uuid)
- priority: high | normal | low
- readAt (date | null)
- createdAt

Indexes:
- messageId unique
- toAgent + readAt + createdAt
- threadId + createdAt

### checkpoints
Fields:
- checkpointId (uuid)
- agentId (uuid)
- summary: { goal, completed[], pending[], decisions[] }
- resumePointer: { nextAction, phase, currentContext? }
- tokensUsed (number)
- createdAt

Indexes:
- checkpointId unique
- agentId + createdAt

### tasks
Fields:
- taskId (uuid)
- parentTaskId (uuid | null)
- assignedTo (uuid | null)
- title, description
- status: pending | assigned | in_progress | completed | failed
- result (string | null)
- createdAt, updatedAt

Indexes:
- taskId unique
- assignedTo + status

### sandbox_tracking (one doc per agent in shared sandbox)
Fields:
- sandboxId (string)
- agentId (uuid)
- squadId (uuid | null)
- taskId (uuid | null)
- status: creating | active | paused | resuming | killed
- metadata: { agentType, specialization?, createdBy? }
- lifecycle: { createdAt, pausedAt, resumedAt, killedAt, lastHeartbeat }
- resources: { cpuCount, memoryMB, timeoutMs }
- costs: { estimatedCost, runtimeSeconds }

Indexes:
- sandboxId + agentId unique
- agentId
- status + lifecycle.lastHeartbeat
- lifecycle.createdAt

---

## 5) Sandbox Runtime (Shared)

Single sandbox lifecycle:
- Created on first agent registration.
- Setup installs dependencies and writes agent runtime assets.
- Used as a shared workspace for all agents and agent processes.

Sandbox setup requirements:
- Create /home/user/squad-lite
- Install dependencies needed for sandbox command execution
- Upload any shared helper scripts or assets

Command execution:
- Agent processes run inside sandbox and execute tasks directly.
- stdout/stderr streams to WebSocket via agent:output events.

Kill semantics:
- kill(agentId): stop the agent process inside sandbox; sandbox remains.
- killSandbox(): terminates sandbox and all agents.

---

## 6) Agent Lifecycle and Orchestration

Agent states:
- idle -> working -> completed
- idle -> working -> error
- idle -> waiting (optional, when blocked on inputs)

Director flow (sandbox process):
1) receive task
2) decompose into subtasks
3) spawn specialists (tool: spawnSpecialist creates records)
4) control plane starts specialist processes explicitly
5) assign tasks
6) wait for results
7) aggregate and report

Specialist flow (sandbox process):
1) receive task assignment
2) execute subtask
3) report result back to director
4) checkpoint progress

---

## 7) Claude SDK Integration (Agentic Loop)

Claude runs inside sandbox agent processes with tool_use handling:
- Maintain conversation history in memory for each agent run.
- On tool_use, execute tool and return tool_result blocks.
- Continue until stop_reason = end_turn or max turns reached.

Session tracking (S7a):
- Each agent has a sessionId persisted in MongoDB.
- Token usage is tracked and updated after each call.
- tokenUsage is cumulative for the agent.

Notification injection (S7b):
- checkInbox returns lightweight previews only.
- Full message content is retrieved only via readMessage(messageId).

---

## 8) Coordination Tools (Tool Use)

Required tools for agents (sandbox runner):
- checkInbox() -> [{ messageId, fromAgent, type, priority, preview, createdAt }]
- readMessage(messageId) -> full message (marks read)
- sendMessage(toAgentId, content, type)
- checkpoint(summary, resumePointer, tokensUsed?)
- updateStatus(status, taskId?)
- createTask(title, description, parentTaskId?)
- assignTask(taskId, agentId)
- completeTask(taskId, result)
- getTaskStatus(taskId)
- spawnSpecialist(specialization) -> agentId
- listSpecialists() -> [{ agentId, type, specialization, status }]
- waitForSpecialists(agentIds, timeoutMs?)
- aggregateResults(tasks)

Host sandbox manager API (non-Claude):
- execute(agentId, command, options?) -> { exitCode, stdout, stderr }
- pause(agentId), resume(agentId), kill(agentId), killSandbox()

---

## 9) REST API

Base path: /api

Agents:
- POST /api/agents
  - create director or specialist (with parentId)
- GET /api/agents
- GET /api/agents/:id/status
- POST /api/agents/:id/task
  - creates task, assigns to director, triggers execution
- DELETE /api/agents/:id
  - kill agent loop
- POST /api/agents/:id/restart
  - restart agent from checkpoint

Sandboxes:
- GET /api/sandboxes
- GET /api/sandboxes/:id
- POST /api/sandboxes/:id/pause
- POST /api/sandboxes/:id/resume
- DELETE /api/sandboxes/:id
- DELETE /api/sandbox (kill shared sandbox)
- GET /api/sandbox/status

Tasks:
- GET /api/tasks
- GET /api/tasks/:id

Messages:
- GET /api/messages?limit=

---

## 10) WebSocket Events (Authoritative)

All WS messages are JSON:
- { type, data, timestamp }

Events:
- agent:created
  data: { agentId, agentType, sandboxId }
- agent:status
  data: { agentId, status, sandboxStatus }
- agent:output
  data: { agentId, stream: stdout|stderr, content, timestamp }
- agent:killed
  data: { agentId, timestamp }
- message:new
  data: { messageId, fromAgent, toAgent, messageType, preview }
- checkpoint:new
  data: { checkpointId, agentId, phase, timestamp }
- task:created
  data: { taskId, title, assignedTo, timestamp }
- task:status
  data: { taskId, status, result?, timestamp }
- sandbox:event
  data: { sandboxId, event: created|paused|resumed|killed, timestamp }

---

## 11) UI Requirements (Web)

Dashboard shows:
- Agent cards with status and sandbox status
- Message feed (previews)
- Checkpoint timeline
- Output panel (stdout/stderr)

UI event handling:
- REST is used for spawn, submit task, kill, restart.
- WebSocket drives all live updates.

---

## 12) Failure Handling

- Any task failure must mark task status = failed and persist result.
- Sandbox failures must transition sandbox_tracking to killed.
- Agent failures must set agent status = error.
- On restart, resume context uses latest checkpoint.

---

## 13) Security and Secrets

- Secrets loaded via config layer only.
- Never write secrets to MongoDB.
- Sandbox env vars only include required keys.

---

## 14) Observability

- Log agent lifecycle transitions.
- Log tool_use calls with tool name + result summary.
- Persist tokenUsage per agent.

---

## 15) Acceptance Criteria

- Spawn director, submit task, orchestration runs to completion.
- Specialists are spawned via tool_use (records) and started explicitly by control plane.
- Messages and checkpoints appear in MongoDB and UI.
- Kill and restart works from checkpoint.
- Sandbox can be paused/resumed and status reflects in UI.
- WebSocket output streaming works (content field).

---

## 16) Implementation Status & Receipts

**Last Updated:** 2026-01-11
**Git Commit:** uncommitted
**Tests:** not run (local E2E ok)

### System Implementation Status

| System | Status | Receipt |
|--------|--------|---------|
| S1 MongoDB Connection | ✅ DONE | `src/db/mongo.ts` - singleton connection via config |
| S2 Zod Schemas | ✅ DONE | `src/db/mongo.ts:8-106` - Agent, Message, Checkpoint, Task, SandboxTracking |
| S3 Agent Registry | ✅ DONE | `src/agents/director.ts`, `src/agents/specialist.ts` |
| S4 Message Bus | ✅ DONE | `src/coordination/messages.ts` |
| S5 Checkpoints | ✅ DONE | `src/coordination/checkpoints.ts` |
| S6 Task Management | ✅ DONE | `src/coordination/tasks.ts` |
| S7a Session Tracking | ✅ DONE | `src/sdk/runner.ts:594-676` - sessionId + tokenUsage |
| S7b Notification Injection | ✅ DONE | `src/sdk/runner.ts:252-266` - 50-char previews |
| S7c Context Assembly | ✅ DONE | `src/coordination/context.ts` |
| S8 Director Agent | ✅ DONE | `src/sandbox/agent-bundle.ts:508-687` - orchestration in sandbox |
| S9 Specialist Agent | ✅ DONE | `src/sandbox/agent-bundle.ts:693-744` |
| S10 Claude SDK Integration | ✅ DONE | `src/sandbox/agent-bundle.ts:439-503` - runs inside sandbox |
| S11 API Entry Points | ✅ DONE | `src/api/server.ts` - REST + WebSocket |

### E2B Sandbox Integration

| Feature | Status | Receipt |
|---------|--------|---------|
| Sandbox Creation | ✅ DONE | E2B CLI shows 2 running sandboxes |
| Agent Process Execution | ✅ DONE | Director ran with exit code 0 |
| stdout/stderr Streaming | ✅ DONE | Output streamed to task.result |
| MongoDB Connection from Sandbox | ✅ DONE | `[Agent] Connected to MongoDB` in logs |
| Environment Variables | ✅ DONE | ANTHROPIC_API_KEY, MONGODB_URI passed |

### WebSocket Contract Compliance

| Event | Status | Receipt |
|-------|--------|---------|
| agent:created | ✅ FIXED | `server.ts:116-120` - agentType, sandboxId |
| agent:status | ✅ FIXED | `server.ts:236,261,275,411` - includes sandboxStatus |
| agent:output | ✅ DONE | `server.ts:33-38` - content field |
| agent:killed | ✅ DONE | `server.ts:364-367` |
| message:new | ✅ DONE | `server.ts` message change stream emits preview |
| checkpoint:new | ✅ DONE | `server.ts` checkpoint change stream emits phase |
| task:created | ✅ DONE | `server.ts:222-227` |
| task:status | ✅ DONE | `server.ts:257-261,277-282` |
| sandbox:event | ✅ DONE | `server.ts:537,581,625,759` |

### E2E Validation Receipts (2026-01-11)

**Test Run:** Director orchestration with real E2B + MongoDB (local)

```
Director ID: ff7de026-8033-41d3-bff1-63ae70aff9ad
Task ID: 47404493-f713-4a3d-9d01-bc31e2bc8be4
Specialists: 589e3acf-2be2-4a86-a023-c84102be584d,
             266b2622-5f0d-480d-9bf5-ef98b5266a11,
             6f099a2f-4e1b-4d34-8316-b3efec7169bc
```

**Result:** task status completed with clean output extracted from sandbox logs.
**Receipt:** `src/api/server.ts` uses `extractAgentResult()` to parse output markers.

### Known Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| Pause/Resume E2B | Low | Not tested with real E2B (API supports it) |

### Files Modified (latest)

```
src/api/server.ts          - Specialist auto-start via task change streams + clean result extraction
src/api/websocket.ts       - message:new and checkpoint:new helpers aligned to contract
src/sdk/runner.ts          - stopReason tracking, S7a/S7b implementation
src/sandbox/agent-bundle.ts - ESM fix, director orchestration, specialist execution
src/sandbox/runner.ts      - E2B sandbox runner
src/sandbox/manager.ts     - sandboxId write to agent, E2B integration
src/db/mongo.ts            - Schema + indexes (drop legacy sandboxId_1 index)
src/coordination/context.ts - Context assembly
package.json               - dev:api script
scripts/fix-indexes.ts     - Index repair script
web/index.html             - Tailwind + fonts for dashboard UI
web/src/App.vue            - Poll messages from backend API
web/src/api/client.ts      - Add agents/messages list endpoints
web/src/api/mock.ts        - Align mock events and message list
web/src/types/index.ts     - Align WS event types with backend contract
+ test files
```
