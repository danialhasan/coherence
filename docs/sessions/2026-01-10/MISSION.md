# Mission: MongoDB Agentic Orchestration Hackathon

**Status:** IN_PROGRESS
**Date:** 2026-01-10
**Team:** Danial + Shafan

---

## Primary Objective

Build and demo Squad Lite — a multi-agent coordination system on MongoDB that demonstrates:
1. Prolonged Coordination (checkpoints, resume)
2. Multi-Agent Collaboration (Director + Specialists via message bus)

---

## Success Criteria

- [ ] Director agent can spawn and coordinate 3 Specialist agents
- [ ] Agents communicate via MongoDB `messages` collection
- [ ] Agents checkpoint state to MongoDB `checkpoints` collection
- [ ] Kill/restart demo works (agent resumes from checkpoint)
- [ ] 3-minute demo is smooth and compelling
- [ ] Submitted before 5:00 PM judging

---

## Timeline

| Time | Milestone |
|------|-----------|
| 9:00 AM | Doors open, setup |
| 10:00 AM | Kickoff |
| 10:30 AM | Sprint 1 start: Core agent loop |
| 12:30 PM | Sprint 1 done: Director + 1 Agent working |
| 1:00 PM | Lunch |
| 1:30 PM | Sprint 2 start: Checkpoints + Resume |
| 3:30 PM | Sprint 2 done: Kill/restart works |
| 3:30 PM | Sprint 3: Demo polish + pitch prep |
| 5:00 PM | **First round judging** |
| 7:00 PM | Finalist demos |

---

## Side Quests (If Time)

- [ ] Add Voyager for video RAG
- [ ] Add x402 payment track
- [ ] Fancy terminal UI

---

## Anti-Goals (DO NOT)

- Build complex UI (MongoDB Compass is our UI)
- Handle edge cases (happy path only)
- Over-engineer (ship MVP)

---

_Created: 2026-01-10 pre-hackathon planning_
