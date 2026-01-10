# Squad Lite

> Multi-agent coordination system built on MongoDB Atlas for the [MongoDB Agentic Orchestration Hackathon](https://cerebralvalley.ai/e/agentic-orchestration-hackathon).

## What is Squad Lite?

Squad Lite demonstrates how MongoDB can power multi-agent AI coordination:

- **Agent Coordination** — Director + Specialist agents communicate via MongoDB message bus
- **Context Persistence** — Agents checkpoint to MongoDB and resume after restart
- **Web Interface** — Vue dashboard with real-time agent visualization

## Tech Stack

| Component | Technology |
|-----------|------------|
| Agent Execution | E2B Sandboxes |
| Backend | Fastify + WebSocket |
| Frontend | Vue 3 + Vite |
| Database | MongoDB Atlas |
| AI | Claude (Anthropic SDK) |
| Validation | Zod |

## Quick Start

```bash
# Clone
git clone https://github.com/danialhasan/squad-lite
cd squad-lite

# Install
pnpm install

# Configure
cp .env.example .env
# Add your keys: MONGODB_URI, ANTHROPIC_API_KEY, E2B_API_KEY

# Validate setup
pnpm tsx scripts/validate-e2b.ts

# Run
pnpm run dev:api     # Backend
cd web && pnpm dev   # Frontend
```

## Demo Highlights

**The "Wow" Moment:** Kill an agent mid-task, show the checkpoint in MongoDB Compass, restart, and watch it seamlessly resume.

```
1. Submit task to Director
2. Watch specialists spawn and coordinate
3. Kill a specialist (Ctrl+C or UI)
4. Show checkpoint in MongoDB Compass
5. Restart — agent resumes from checkpoint
6. Task completes successfully
```

## Project Structure

```
squad-lite/
├── docs/specs/
│   ├── web/           # Primary: E2B + Vue + Fastify
│   └── cli/           # Fallback: Local + CLI
├── src/
│   ├── agents/        # Director + Specialist
│   ├── coordination/  # Messages, Checkpoints, Tasks
│   ├── sandbox/       # E2B integration
│   └── api/           # Fastify routes
└── web/               # Vue dashboard
```

## Team

- **Danial** — [@danialhasan](https://github.com/danialhasan)
- **Shafan** — [@shafan](https://github.com/shafan)

## Links

- [Hackathon Event](https://cerebralvalley.ai/e/agentic-orchestration-hackathon)
- [MongoDB Atlas](https://www.mongodb.com/atlas)
- [E2B Sandboxes](https://e2b.dev)

---

Built for MongoDB Agentic Orchestration & Collaboration Hackathon — January 10, 2026
