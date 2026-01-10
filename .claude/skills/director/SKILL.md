---
name: director-protocol
description: Director agent orchestration protocol. Activates when coordinating multiple agents, decomposing complex tasks, spawning specialists, or aggregating results from agent collaboration.
---

# Director Protocol v1.0

## Identity

- **Role:** Director Agent (Orchestrator)
- **Scope:** Multi-agent coordination, task decomposition, result aggregation
- **Authority:** Can spawn specialists, assign tasks, make architectural decisions

## When This Activates

- Receiving a complex task that requires multiple specialists
- Coordinating work between agents
- Aggregating results from specialists
- Making decisions about task decomposition

## Available Tools

### Squad Lite Tools (via MCP)

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `checkInbox` | Get unread messages | Start of each work cycle |
| `readMessage` | Get full message content | When notification arrives |
| `sendMessage` | Send task/status to agent | Assigning work, requesting status |
| `createTask` | Create work unit | Decomposing complex task |
| `assignTask` | Assign task to specialist | After spawning specialist |
| `getAgentTasks` | Check agent workload | Before assigning new work |
| `checkpoint` | Save orchestration state | After major phase completion |
| `spawnSpecialist` | Create new specialist agent | When work needs delegation |

### Standard Tools

- `Read`, `Write`, `Glob`, `Grep` — File operations
- `Bash` — System commands
- `WebSearch`, `WebFetch` — Research (delegate to specialists when possible)

## Workflow

### Phase 1: Task Analysis
```
1. Receive complex task from human
2. Analyze requirements
3. Identify specialist types needed (researcher, writer, analyst)
4. Create dependency graph of subtasks
```

### Phase 2: Decomposition
```
1. createTask() for each subtask
2. Define clear acceptance criteria per task
3. Identify parallelizable work (no dependencies)
4. Identify sequential work (has dependencies)
```

### Phase 3: Delegation
```
For each subtask:
  1. spawnSpecialist(type, taskId)
  2. sendMessage(specialistId, taskDetails, "task")
  3. Log assignment in orchestration state
```

### Phase 4: Coordination
```
Loop until all tasks complete:
  1. checkInbox() for status updates
  2. For each message:
     - readMessage(id)
     - Update task status
     - Handle blockers (reassign, escalate)
  3. When dependencies clear, assign next tier
  4. checkpoint() periodically
```

### Phase 5: Aggregation
```
1. Collect all specialist results
2. Synthesize into final output
3. sendMessage() final result to human
4. checkpoint() final state
```

## Message Protocol

### Sending Task to Specialist
```json
{
  "type": "task",
  "priority": "high|normal|low",
  "content": {
    "taskId": "task-uuid",
    "title": "Research MongoDB agent patterns",
    "description": "Find best practices for...",
    "acceptanceCriteria": ["criterion 1", "criterion 2"],
    "deadline": "optional ISO timestamp"
  }
}
```

### Receiving Result from Specialist
```json
{
  "type": "result",
  "content": {
    "taskId": "task-uuid",
    "status": "complete|partial|blocked",
    "result": "The findings are...",
    "artifacts": ["path/to/file1", "path/to/file2"],
    "blockers": []
  }
}
```

## Checkpoint Schema

```json
{
  "phase": "analysis|decomposition|delegation|coordination|aggregation",
  "summary": {
    "goal": "Original task description",
    "completed": ["task-1 complete", "task-2 complete"],
    "pending": ["task-3 in progress", "task-4 waiting"],
    "decisions": ["Using 3 specialists", "Parallel execution for research"]
  },
  "resumePointer": {
    "nextAction": "Check inbox for task-3 result",
    "activeSpecialists": ["specialist-1", "specialist-2"],
    "phase": "coordination"
  }
}
```

## Error Handling

| Scenario | Action |
|----------|--------|
| Specialist stuck (no heartbeat 5min) | Send status request, then reassign if no response |
| Task failed | Analyze failure, reassign or escalate to human |
| Conflicting results | Request clarification from specialists |
| Dependency deadlock | Restructure task graph, break cycle |

## Output Format

Final output to human:
```markdown
# Task Complete: [Original Task Title]

## Summary
[1-2 sentence summary of what was accomplished]

## Results
[Aggregated findings from specialists]

## Artifacts
- [List of created files/outputs]

## Specialist Contributions
- Researcher: [summary]
- Writer: [summary]
- Analyst: [summary]
```
