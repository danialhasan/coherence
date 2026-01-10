---
name: coordination-protocol
description: Task coordination and handoff protocol. Activates when creating tasks, assigning work, handling dependencies, or managing multi-agent workflows. Used by Director for orchestration.
---

# Coordination Protocol v1.0

## Overview

This protocol defines how work is decomposed, assigned, and coordinated across multiple agents. Primarily used by the Director agent.

## Core Principles

1. **Explicit dependencies**: Know what blocks what
2. **Parallel when possible**: Maximize throughput
3. **Clear ownership**: One agent per task
4. **Visible progress**: Track state in MongoDB

## Task Lifecycle

```
┌─────────┐    ┌──────────┐    ┌─────────────┐    ┌───────────┐    ┌──────────┐
│ pending │───▶│ assigned │───▶│ in_progress │───▶│ completed │    │  failed  │
└─────────┘    └──────────┘    └─────────────┘    └───────────┘    └──────────┘
                                      │                               ▲
                                      └───────────────────────────────┘
```

## Tool Usage

### Create Task

```
createTask(title, description, parentTaskId?)
```

**Parameters:**
- `title`: Short task name
- `description`: Full details including acceptance criteria
- `parentTaskId`: Optional, for subtask hierarchy

**Returns:**
```json
{
  "taskId": "task-uuid",
  "status": "pending",
  "createdAt": "2026-01-10T10:30:00Z"
}
```

### Assign Task

```
assignTask(taskId, agentId)
```

**Effect:**
- Sets `assignedTo` = agentId
- Sets `status` = "assigned"
- Agent should receive task via message bus

### Update Task Status

```
updateTaskStatus(taskId, status, result?)
```

**Statuses:**
- `in_progress`: Work started
- `completed`: Work done (include result)
- `failed`: Work failed (include error)

### Get Agent Tasks

```
getAgentTasks(agentId)
```

**Returns:** List of tasks assigned to agent

## Task Decomposition

### Decomposition Process

```
1. Analyze complex task
   └─ Identify distinct work items

2. Create dependency graph
   └─ What depends on what?

3. Identify tiers
   └─ Tier 0: No dependencies (can start immediately)
   └─ Tier 1: Depends on Tier 0
   └─ Tier N: Depends on Tier N-1

4. Create tasks
   └─ One task per work item
   └─ Include acceptance criteria

5. Assign Tier 0 tasks
   └─ Parallel execution begins
```

### Dependency Graph Example

```
Task: "Research and write report on MongoDB agents"

Decomposition:
├── T1: Research official MongoDB docs (Tier 0)
├── T2: Research community examples (Tier 0)
├── T3: Analyze patterns across sources (Tier 1, depends on T1, T2)
├── T4: Write introduction (Tier 1, depends on T1)
├── T5: Write main findings (Tier 2, depends on T3, T4)
└── T6: Write conclusion (Tier 2, depends on T5)

Execution:
  Tier 0: T1, T2 (parallel)
  Tier 1: T3, T4 (parallel, after Tier 0)
  Tier 2: T5, then T6 (sequential)
```

## Assignment Strategy

### Specialist Selection

| Task Type | Specialist |
|-----------|------------|
| Information gathering | Researcher |
| Content creation | Writer |
| Code/data evaluation | Analyst |
| Multiple aspects | Multiple specialists |

### Load Balancing

```
1. Check agent workload
   └─ getAgentTasks(agentId)

2. Prefer idle agents
   └─ Agents with 0 in_progress tasks

3. Consider specialization fit
   └─ Match task type to specialist type

4. Avoid overloading
   └─ Max 2 concurrent tasks per agent
```

## Coordination Patterns

### Parallel Execution

```
Director assigns Tier 0 tasks simultaneously:

Director                Researcher         Writer
    |                        |                |
    |------- T1 ------------>|                |
    |------- T2 --------------------------->  |
    |                        |                |
    |<------ T1 result ------|                |
    |<------ T2 result -----------------------|
    |                        |                |
```

### Sequential with Handoff

```
Tier 1 waits for Tier 0:

Director                Researcher         Analyst
    |                        |                |
    |------- T1 ------------>|                |
    |                        |                |
    |<------ T1 result ------|                |
    |                        |                |
    |------- T3 (uses T1) ----------------->  |
    |                        |                |
    |<------ T3 result -----------------------|
    |                        |                |
```

### Result Aggregation

```
Director collects all results:

1. Maintain result map: { taskId: result }
2. As results arrive, add to map
3. When all tasks complete:
   └─ Aggregate results
   └─ Synthesize final output
   └─ Report to human
```

## Progress Tracking

### Task Board (Conceptual)

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│   PENDING   │  ASSIGNED   │ IN_PROGRESS │  COMPLETED  │
├─────────────┼─────────────┼─────────────┼─────────────┤
│             │             │ T1 (Rsch)   │             │
│             │             │ T2 (Writer) │             │
│ T3          │             │             │             │
│ T4          │             │             │             │
│ T5          │             │             │             │
│ T6          │             │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### Director Checkpoint (Coordination State)

```json
{
  "phase": "coordination",
  "summary": {
    "goal": "Complete research and write report",
    "completed": ["T1 assigned", "T2 assigned"],
    "pending": ["Waiting for T1, T2 results", "T3-T6 not started"],
    "decisions": ["Parallel T1, T2", "Sequential T3 after both"]
  },
  "resumePointer": {
    "nextAction": "Check inbox for T1/T2 results",
    "phase": "coordination"
  },
  "coordinationState": {
    "tasks": {
      "T1": {"status": "in_progress", "agent": "researcher-001"},
      "T2": {"status": "in_progress", "agent": "writer-001"},
      "T3": {"status": "pending", "depends": ["T1", "T2"]},
      "T4": {"status": "pending", "depends": ["T1"]},
      "T5": {"status": "pending", "depends": ["T3", "T4"]},
      "T6": {"status": "pending", "depends": ["T5"]}
    },
    "results": {}
  }
}
```

## Error Handling

### Task Failure

```
1. Receive error message from specialist
2. Analyze failure reason
3. Decision:
   └─ Recoverable: Reassign to same or different specialist
   └─ Unrecoverable: Mark task failed, escalate to human
```

### Agent Timeout

```
1. No heartbeat for 5+ minutes
2. Send status request
3. If no response in 2 minutes:
   └─ Mark agent as unresponsive
   └─ Reassign tasks to other specialists
   └─ Log incident
```

### Dependency Deadlock

```
1. Detect circular dependency
2. Log error
3. Break cycle by:
   └─ Removing lowest-priority edge
   └─ Or escalating to human
```

## Best Practices

1. **Create fine-grained tasks**: Easier to track and parallelize
2. **Include acceptance criteria**: Clear definition of done
3. **Track dependencies explicitly**: Don't assume order
4. **Checkpoint coordination state**: Resume orchestration after restart
5. **Use timeouts**: Don't wait forever for stuck agents
6. **Log decisions**: Why tasks were assigned to specific agents
