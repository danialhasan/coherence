# Squad Lite - Web Full Implementation Spec (Shared Sandbox)

Version: 4.0
Date: 2026-01-10
Status: Authoritative full implementation spec

This spec defines the REQUIRED full implementation for the Web approach.
No demo shortcuts. No stubs. All systems must be implemented.

Decisions (locked):
- Single shared E2B sandbox for all agents.
- Host process runs the Claude agentic loop (canonical runtime).
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
                           | sandbox commands + files
                           v
                 E2B SANDBOX (single shared)
                 - shared workspace
                 - commands run here
```

Key rules:
- Agents are logical actors in the host process.
- The shared sandbox is used for execution, filesystem, and tools.
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
- Multi-turn agentic loop with tool_use.
- Tool execution for coordination and sandbox actions.

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

### sandbox_tracking (single doc per sandbox)
Fields:
- sandboxId (string)
- status: creating | active | paused | resuming | killed
- lifecycle: { createdAt, pausedAt, resumedAt, killedAt, lastHeartbeat }
- resources: { cpuCount, memoryMB, timeoutMs }
- costs: { estimatedCost, runtimeSeconds }
- agents: [
  { agentId, type, specialization?, status, processStatus, lastHeartbeat }
]

Indexes:
- sandboxId unique
- agents.agentId
- status + lifecycle.lastHeartbeat

---

## 5) Sandbox Runtime (Shared)

Single sandbox lifecycle:
- Created on first agent registration.
- Setup installs dependencies and writes agent runtime assets.
- Used as a shared workspace for all agents.

Sandbox setup requirements:
- Create /home/user/squad-lite
- Install dependencies needed for sandbox command execution
- Upload any shared helper scripts or assets

Command execution:
- All code execution and filesystem access happens inside sandbox.
- stdout/stderr streams to WebSocket via agent:output events.

Kill semantics:
- kill(agentId): stop the agent loop in host; sandbox remains.
- killSandbox(): terminates sandbox and all agents.

---

## 6) Agent Lifecycle and Orchestration

Agent states:
- idle -> working -> completed
- idle -> working -> error
- idle -> waiting (optional, when blocked on inputs)

Director flow (host process):
1) receive task
2) decompose into subtasks
3) spawn specialists (tool: spawnSpecialist)
4) assign tasks
5) wait for results
6) aggregate and report

Specialist flow (host process):
1) receive task assignment
2) execute subtask
3) report result back to director
4) checkpoint progress

---

## 7) Claude SDK Integration (Agentic Loop)

Claude runs in host process with tool_use handling:
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

Required tools for agents:
- checkInbox(limit?) -> [{ messageId, fromAgent, type, priority, preview, createdAt }]
- readMessage(messageId) -> full message (marks read)
- sendMessage(toAgentId, content, type)
- checkpoint(summary, resumePointer)
- createTask(title, description, parentTaskId?)
- assignTask(taskId, agentId)
- completeTask(taskId, result)
- getTaskStatus(taskId)
- listAgents(type?, status?)
- spawnSpecialist(parentId, specialization) -> agentId

Sandbox IO tools (required):
- runCommand(command, cwd?, env?, timeoutMs?) -> { exitCode, stdout, stderr }
- readFile(path) -> contents
- writeFile(path, contents)
- listFiles(path)

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
- Specialists are spawned via tool_use and report results.
- Messages and checkpoints appear in MongoDB and UI.
- Kill and restart works from checkpoint.
- Sandbox can be paused/resumed and status reflects in UI.
- WebSocket output streaming works (content field).

