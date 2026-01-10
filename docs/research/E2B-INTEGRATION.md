# E2B Integration Analysis — Squad Lite

**Research Date:** 2026-01-10
**Purpose:** Determine how E2B sandboxes fit into Squad Lite architecture for web-based multi-agent coordination

---

## Executive Summary

**E2B is critical for Squad Lite** because it solves the fundamental constraint: **web apps don't have filesystem access**.

### Key Capabilities

| Capability | How It Helps Squad Lite |
|------------|------------------------|
| **Secure Sandboxes** | Agents execute code safely in isolated VMs |
| **150ms Startup** | Fast enough for real-time agent spawning |
| **Pause/Resume** | Agents can hibernate between tasks, persist state up to 30 days |
| **Filesystem API** | Agents read/write files as if they had local filesystem |
| **Streaming Output** | Real-time npm install, test results, build output |
| **MCP Gateway** | Host Squad Lite MCP server + access 200+ Docker tools |
| **$100 Free Credits** | More than enough for hackathon ($0.65 total cost) |

---

## E2B in Squad Lite Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                               WEB APP (Browser)                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  React Frontend                                                      │    │
│  │  • Task submission                                                   │    │
│  │  • Real-time agent status                                            │    │
│  │  • MongoDB Compass-style visualization                               │    │
│  │  • Demo controls (spawn, kill, restart)                              │    │
│  └────────────────────┬───────────────────────────────────────────────┘    │
│                       │                                                      │
└───────────────────────┼──────────────────────────────────────────────────────┘
                        │ WebSocket + HTTP
                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          SQUAD LITE BACKEND (Node.js)                       │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  Fastify API                                                         │    │
│  │  • Agent lifecycle management                                        │    │
│  │  • E2B sandbox orchestration                                         │    │
│  │  • MongoDB coordination                                              │    │
│  │  • WebSocket events                                                  │    │
│  └────────┬────────────────────────────┬──────────────────────────────┘    │
│           │                            │                                     │
│           │                            │                                     │
└───────────┼────────────────────────────┼─────────────────────────────────────┘
            │                            │
            ▼                            ▼
┌────────────────────────┐    ┌────────────────────────────────────────────┐
│   MONGODB ATLAS        │    │         E2B SANDBOXES                      │
│                        │    │                                            │
│  • agents              │    │  ┌──────────────┐  ┌──────────────┐       │
│  • messages            │    │  │  Director    │  │ Specialist 1 │       │
│  • checkpoints         │    │  │  Sandbox     │  │ Sandbox      │       │
│  • tasks               │    │  │              │  │              │       │
│  • sandbox_tracking    │◀───┼──│ sandboxId:X  │  │ sandboxId:Y  │       │
│                        │    │  │ agentId:A    │  │ agentId:B    │       │
└────────────────────────┘    │  └──────┬───────┘  └──────┬───────┘       │
                              │         │                 │                │
                              │         │                 │                │
                              │  ┌──────┴─────────────────┴───────┐       │
                              │  │      MCP Gateway (Docker)        │       │
                              │  │  • Squad Lite MCP Server         │       │
                              │  │  • GitHub MCP (optional)         │       │
                              │  │  • 200+ Docker catalog tools     │       │
                              │  └──────────────────────────────────┘       │
                              └────────────────────────────────────────────┘
```

---

## Integration Points

### 1. Sandbox Creation & Tracking

**When:** Director spawns a Specialist, or Specialist needs isolated workspace

**How:**
```typescript
// Backend: Sandbox Manager
const sandbox = await Sandbox.create({
  timeoutMs: 10 * 60 * 1000, // 10 minutes
  metadata: {
    agentId: 'specialist-researcher-001',
    agentType: 'researcher',
    squadId: 'squad-demo-001',
    taskId: 'task-123',
    createdBy: 'director-001'
  },
  mcp: {
    'github/trysquad/squad-lite-mcp': {
      installCmd: 'npm install',
      runCmd: 'npm start'
    }
  }
});

// Store in MongoDB
await saveSandboxTracking({
  sandboxId: sandbox.id,
  agentId: 'specialist-researcher-001',
  status: 'active',
  metadata: sandbox.getInfo().metadata,
  createdAt: new Date()
});
```

### 2. Agent Code Execution

**When:** Agents need to run commands (npm install, tests, code analysis)

**How:**
```typescript
// Execute command with streaming
await sandbox.commands.run('npm install', {
  cwd: '/home/user/squad-lite',
  onStdout: (data) => {
    // Stream to frontend via WebSocket
    io.to(agentId).emit('stdout', data);

    // Log to checkpoint
    appendToCheckpoint(agentId, { type: 'stdout', data });
  },
  onStderr: (data) => {
    io.to(agentId).emit('stderr', data);
  }
});
```

### 3. File Operations (Agent's Workspace)

**When:** Agents need persistent workspace across operations

**How:**
```typescript
// Write project files
await sandbox.files.write('/home/user/squad-lite/src/agent.ts', agentCode);

// Read agent output
const result = await sandbox.files.read('/home/user/squad-lite/output.json');

// List workspace
const files = await sandbox.files.list('/home/user/squad-lite');
```

### 4. Pause/Resume (Agent Hibernation)

**When:** Agent idle for 2+ minutes, or handoff to another agent

**How:**
```typescript
// Pause agent sandbox
await sandbox.pause();
await updateMongoDB({
  agentId,
  sandboxStatus: 'paused',
  pausedAt: new Date()
});

// Resume later
const sandbox = await Sandbox.connect(sandboxId);
await sandbox.resume();
await updateMongoDB({
  agentId,
  sandboxStatus: 'active',
  resumedAt: new Date()
});
```

### 5. Claude Agent SDK Connection

**When:** Agent needs to invoke Claude with Squad Lite tools

**How:**
```typescript
// Get MCP gateway credentials
const mcpUrl = sandbox.getMcpUrl();
const mcpToken = await sandbox.getMcpToken();

// Connect Claude Agent SDK
for await (const message of query({
  prompt: agentTask,
  options: {
    mcpServers: {
      "e2b-squad-lite": {
        type: "http",
        url: mcpUrl,
        headers: { "Authorization": `Bearer ${mcpToken}` }
      }
    },
    allowedTools: ["Skill", "Read", "Write", "checkInbox", "sendMessage", ...]
  }
})) {
  // Process agent output
}
```

---

## Updated Data Model

### New Collection: `sandbox_tracking`

```typescript
interface SandboxTracking {
  _id: ObjectId;
  sandboxId: string;          // E2B sandbox ID
  agentId: string;            // Squad agent ID
  squadId: string;            // Squad ID
  taskId: string | null;      // Current task
  status: 'creating' | 'active' | 'paused' | 'resuming' | 'killed';
  metadata: {
    agentType: string;
    createdBy: string;
    // ... E2B metadata passthrough
  };
  lifecycle: {
    createdAt: Date;
    pausedAt: Date | null;
    resumedAt: Date | null;
    killedAt: Date | null;
    lastHeartbeat: Date;
  };
  resources: {
    cpuCount: number;         // vCPUs allocated
    memoryMB: number;         // RAM in MB
    timeoutMs: number;        // Session timeout
  };
  costs: {
    estimatedCost: number;    // USD
    runtimeSeconds: number;
  };
}
```

### Updated `Agent` Schema

```typescript
interface Agent {
  agentId: string;
  type: 'director' | 'specialist';
  specialization?: 'researcher' | 'writer' | 'analyst';
  status: 'idle' | 'working' | 'waiting' | 'completed' | 'error';

  // NEW: Sandbox tracking
  sandboxId: string | null;  // Current E2B sandbox
  sandboxStatus: 'none' | 'active' | 'paused' | 'killed';

  parentId: string | null;
  taskId: string | null;
  sessionId?: string;        // Claude SDK session ID
  createdAt: Date;
  lastHeartbeat: Date;
}
```

---

## Key Architectural Decisions

### Decision 1: One Sandbox Per Agent (Not Shared)

**Rationale:**
- Isolation prevents conflicts
- Easier state management
- Pause/resume per agent
- Concurrent work without interference

**Trade-off:**
- More sandboxes = higher cost (~$0.11/hour each)
- But: Free tier has 20 concurrent limit (way more than we need)

### Decision 2: Pause-on-Idle Strategy

**Rationale:**
- Cost optimization (only pay when working)
- State preserved up to 30 days
- Resume time ~1 second (acceptable)

**Implementation:**
```typescript
// Auto-pause after 2 minutes idle
setInterval(async () => {
  const idleAgents = await getIdleAgents({ idleForMs: 2 * 60 * 1000 });
  for (const agent of idleAgents) {
    await pauseSandbox(agent.sandboxId);
  }
}, 30 * 1000); // Check every 30s
```

### Decision 3: MongoDB as Source of Truth

**Rationale:**
- E2B metadata is limited (flat key-value)
- MongoDB has rich querying
- Survives sandbox kills/recreations
- Frontend queries MongoDB, not E2B API

**Sync Pattern:**
```typescript
// E2B → MongoDB
sandbox.on('event', async (event) => {
  await updateMongoDB({ sandboxId, event });
});

// MongoDB → Frontend
io.emit('sandbox:update', await getSandboxTracking(sandboxId));
```

### Decision 4: Hybrid MCP Hosting

**Development:** Local `.mcp.json` (faster iteration)
**Production:** E2B MCP Gateway (isolated, scalable)

**Config:**
```typescript
const mcpConfig = process.env.NODE_ENV === 'production'
  ? { "e2b-gateway": { type: "http", url: e2bUrl, ... } }
  : undefined; // Uses .mcp.json
```

---

## Cost Analysis (Hackathon)

| Scenario | Sandboxes | Duration | Cost |
|----------|-----------|----------|------|
| **3 Agents Continuous** | 3 | 2 hours | $0.65 |
| **3 Agents Pause-on-Idle** | 3 | ~1 hour active | $0.33 |
| **Demo Mode (10 runs)** | 3 | 10 × 10min | $0.54 |

**Free Tier:** $100 credits → Can run 153 hackathons

**Recommendation:** Use continuous mode for demo reliability, pause-on-idle for cost optimization if needed.

---

## Technical Specifications

### E2B Sandbox Configuration

```typescript
const SQUAD_LITE_SANDBOX_CONFIG = {
  // Resources
  timeoutMs: 10 * 60 * 1000,  // 10 minutes (extendable)

  // Base image (default: e2b-official/code-interpreter)
  // Custom template: https://e2b.dev/docs/guide/custom-sandbox

  // Environment
  envs: {
    NODE_ENV: 'production',
    MONGODB_URI: process.env.MONGODB_URI,
    // ... other env vars
  },

  // MCP Servers
  mcp: {
    'github/trysquad/squad-lite-mcp': {
      installCmd: 'npm install',
      runCmd: 'npm start',
      env: {
        MONGODB_URI: process.env.MONGODB_URI
      }
    }
  },

  // Metadata (synced to MongoDB)
  metadata: {
    agentId: 'uuid',
    agentType: 'researcher',
    squadId: 'uuid',
    environment: 'hackathon'
  }
};
```

### API Endpoints (Backend)

```typescript
// Sandbox lifecycle
POST   /api/sandboxes              # Create sandbox for agent
GET    /api/sandboxes/:id          # Get sandbox info
POST   /api/sandboxes/:id/pause    # Pause sandbox
POST   /api/sandboxes/:id/resume   # Resume sandbox
DELETE /api/sandboxes/:id          # Kill sandbox

// Agent operations
POST   /api/agents/:id/execute     # Execute command in agent sandbox
GET    /api/agents/:id/workspace   # List files in sandbox
GET    /api/agents/:id/logs        # Stream logs from sandbox
```

### WebSocket Events

```typescript
// Client → Server
'agent:create'      # Spawn new agent
'agent:kill'        # Terminate agent
'agent:restart'     # Kill + respawn with checkpoint

// Server → Client
'sandbox:created'   # Sandbox ready
'sandbox:stdout'    # Real-time output
'sandbox:stderr'    # Real-time errors
'sandbox:paused'    # Sandbox hibernated
'sandbox:resumed'   # Sandbox awake
'sandbox:killed'    # Sandbox terminated
```

---

## Implementation Checklist

### Phase 1: E2B Integration (Tier 1)
- [ ] Set up E2B account, get API key
- [ ] Create `SandboxManager` service
- [ ] Implement `createForAgent(agentId, config)`
- [ ] Implement `executeCommand(sandboxId, cmd, opts)`
- [ ] Implement `pause(sandboxId)` / `resume(sandboxId)`
- [ ] Create `sandbox_tracking` MongoDB collection
- [ ] Sync E2B events to MongoDB

### Phase 2: Agent-Sandbox Binding (Tier 2)
- [ ] Update Director to create sandboxes on spawn
- [ ] Update Specialist to use sandbox filesystem
- [ ] Implement auto-pause on idle
- [ ] Implement checkpoint-aware sandbox recreation

### Phase 3: Frontend Integration (Tier 3)
- [ ] WebSocket for real-time sandbox events
- [ ] Sandbox status visualization
- [ ] Streaming logs component
- [ ] Demo controls (spawn, kill, restart)

---

## Open Questions

1. **Custom E2B Template?**
   - Should we create a custom sandbox image with Squad Lite pre-installed?
   - Pro: Faster startup (no npm install), Con: More setup

2. **Sandbox Pool?**
   - Should we pre-warm sandboxes for instant agent spawning?
   - Pro: 0ms spawn latency, Con: Higher idle costs

3. **Filesystem Strategy?**
   - Keep all work in sandbox ephemeral storage?
   - Or mount external S3 for persistence?
   - Recommendation: Ephemeral + MongoDB for state (simpler)

4. **MCP Server Deployment?**
   - Host Squad Lite MCP in each sandbox?
   - Or single shared MCP server?
   - Recommendation: Per-sandbox (isolated, secure)

---

## References

- [E2B Documentation](https://e2b.dev/docs)
- [E2B Pricing](https://e2b.dev/pricing)
- [E2B MCP Integration](https://e2b.dev/docs/mcp)
- [E2B JavaScript SDK](https://e2b.dev/docs/sdk-reference/js-sdk/v1.0.1/sandbox)
- [E2B Sandbox Persistence](https://e2b.dev/docs/sandbox/persistence)
- [E2B Lifecycle Events API](https://e2b.dev/docs/sandbox/lifecycle-events-api)
- [Claude Agent SDK MCP](https://platform.claude.com/docs/en/agent-sdk/mcp)
- [Docker MCP Catalog](https://docs.docker.com/ai/mcp-catalog-and-toolkit/catalog/)

---

_Research complete. Ready for spec integration._
