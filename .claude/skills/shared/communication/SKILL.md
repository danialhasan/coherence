---
name: agent-communication
description: Inter-agent communication protocol. Activates when sending messages to other agents, checking inbox, or coordinating via the message bus. All agents must follow this protocol.
---

# Agent Communication Protocol v1.0

## Overview

This protocol defines how agents communicate via the MongoDB message bus. All agents (Director, Specialists) MUST follow this protocol for reliable coordination.

## Core Principles

1. **Asynchronous**: Messages are stored in MongoDB, not direct calls
2. **Notification-based**: Lightweight notifications, full content on-demand
3. **Threaded**: Related messages share a threadId
4. **Prioritized**: Messages have priority levels
5. **Acknowledged**: Messages marked read after processing

## Message Types

| Type | Sender | Receiver | Purpose |
|------|--------|----------|---------|
| `task` | Director | Specialist | Assign work |
| `result` | Specialist | Director | Report completion |
| `status` | Any | Any | Progress update |
| `error` | Any | Any | Report problem |

## Message Priority

| Priority | When to Use | Expected Response |
|----------|-------------|-------------------|
| `high` | Blocking work, urgent | Immediate |
| `normal` | Standard work | Next work cycle |
| `low` | FYI, non-blocking | When convenient |

## Tool Usage

### Check for Messages

```
checkInbox()
```

**Returns:**
```json
{
  "count": 2,
  "notifications": [
    {
      "id": "msg-uuid",
      "from": "director",
      "type": "task",
      "preview": "Research MongoDB patterns...",
      "timestamp": "2026-01-10T10:30:00Z"
    }
  ]
}
```

**When to call:**
- Start of every work cycle
- After completing a task
- Periodically during long operations (every 5 min)

### Read Full Message

```
readMessage(messageId)
```

**Returns:**
```json
{
  "id": "msg-uuid",
  "from": "director-001",
  "to": "researcher-001",
  "content": "Full message content here...",
  "type": "task",
  "threadId": "thread-uuid",
  "priority": "normal",
  "createdAt": "2026-01-10T10:30:00Z"
}
```

**When to call:**
- After receiving notification via checkInbox()
- When you need the full content (not just preview)

### Send Message

```
sendMessage(to, content, type, priority?, threadId?)
```

**Parameters:**
- `to`: Recipient agent ID
- `content`: Message content (JSON stringified for structured data)
- `type`: "task" | "result" | "status" | "error"
- `priority`: "high" | "normal" | "low" (default: "normal")
- `threadId`: Optional, for continuing a conversation

**When to call:**
- Assigning tasks (Director → Specialist)
- Reporting results (Specialist → Director)
- Requesting help or reporting blockers
- Status updates on long-running work

## Message Content Schemas

### Task Message
```json
{
  "taskId": "task-uuid",
  "title": "Short task title",
  "description": "Detailed description of what to do",
  "acceptanceCriteria": [
    "Criterion 1",
    "Criterion 2"
  ],
  "context": {
    "previousResults": "Optional reference to prior work",
    "constraints": ["Time limit", "Scope limit"]
  }
}
```

### Result Message
```json
{
  "taskId": "task-uuid",
  "status": "complete|partial|blocked",
  "result": "The output or findings",
  "artifacts": [
    "path/to/file1.md",
    "path/to/file2.json"
  ],
  "blockers": [],
  "metrics": {
    "timeSpent": "30min",
    "tokensUsed": 15000
  }
}
```

### Status Message
```json
{
  "taskId": "task-uuid",
  "progress": 60,
  "currentPhase": "research",
  "eta": "15min",
  "notes": "Found 2 of 3 required sources"
}
```

### Error Message
```json
{
  "taskId": "task-uuid",
  "errorType": "blocked|failed|timeout",
  "description": "What went wrong",
  "recoverable": true,
  "suggestedAction": "Reassign to different specialist"
}
```

## Communication Patterns

### Request-Response
```
Director                    Specialist
    |                           |
    |---- task message -------->|
    |                           |
    |<--- result message -------|
    |                           |
```

### Status Updates (Long Tasks)
```
Director                    Specialist
    |                           |
    |---- task message -------->|
    |                           |
    |<--- status (25%) ---------|
    |                           |
    |<--- status (50%) ---------|
    |                           |
    |<--- status (75%) ---------|
    |                           |
    |<--- result message -------|
    |                           |
```

### Error & Recovery
```
Director                    Specialist
    |                           |
    |---- task message -------->|
    |                           |
    |<--- error message --------|
    |                           |
    |---- reassign/help ------->|
    |                           |
```

## Best Practices

1. **Always check inbox at work cycle start**
2. **Process high priority messages first**
3. **Send status updates for tasks > 10 min**
4. **Include taskId in all messages for threading**
5. **Use structured JSON for complex content**
6. **Keep message content < 10KB (summarize if needed)**
7. **Mark messages read after processing to avoid reprocessing**

## Error Handling

| Scenario | Action |
|----------|--------|
| No messages in inbox | Continue current work or idle |
| Can't parse message | Send error message back, log issue |
| Unknown sender | Log warning, process if valid format |
| Duplicate message | Skip if already processed (check threadId) |
