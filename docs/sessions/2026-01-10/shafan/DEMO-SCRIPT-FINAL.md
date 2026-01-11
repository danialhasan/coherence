# Coherence Demo Script (Final)

**Event:** MongoDB Agentic Orchestration Hackathon
**Date:** January 10, 2026 - Judging at 5 PM
**Team:** Danial + Shafan
**Time:** 3 minutes sharp

---

## Pre-Demo Setup

```
[ ] Demo URL: https://web-eta-seven-31.vercel.app?mock=true
[ ] MongoDB Compass open (agents, messages, checkpoints collections)
[ ] Browser zoomed to 110-125% for projector readability
[ ] Demo state reset (click "Reset Demo")
[ ] Timer visible
```

---

## THE SCRIPT

### ACT 1: THE PAIN [0:00 - 0:30]

**[SCREEN: Empty dashboard, Demo Mode helper visible]**

> **"The theme of this hackathon is agentic orchestration and collaboration.**
>
> **But here's the reality: today's AI agents are islands.**
>
> **They can't coordinate. They can't share context. They can't work together.**
>
> **If you've ever tried to get two agents to collaborate on a task, you know - it's chaos. One doesn't know what the other is doing. There's no shared state. No coordination layer.**
>
> **We built Coherence to change that."**

**[30 seconds]**

---

### ACT 2: THE VISION [0:30 - 1:00]

**[SCREEN: Point to Run Status Bar with track pills]**

> **"Coherence proves two things:**
>
> **One: Prolonged Coordination."**
>
> *[Point to first pill]*
>
> **"Agents checkpoint their state to MongoDB. They can be stopped, restarted, and resume exactly where they left off. Coordination that persists through anything.**
>
> **Two: Multi-Agent Collaboration."**
>
> *[Point to second pill]*
>
> **"A Director agent coordinates Specialists through a MongoDB message bus. Real-time. Observable. Persistent.**
>
> **MongoDB isn't just our database. It's the nervous system for agent coordination.**
>
> **Let me show you."**

**[30 seconds]**

---

### ACT 3: THE PROOF [1:00 - 2:00]

#### Spawn Director [1:00 - 1:15]

**[ACTION: Click "Spawn Director"]**

> **"I spawn a Director agent."**

**[SCREEN: Director card appears with blue left accent, status "idle"]**

> **"It's connected to its own sandbox. Ready to coordinate."**

---

#### Submit Task [1:15 - 1:30]

**[ACTION: Type "Research MongoDB agent coordination patterns" → Click Submit]**

> **"I give it a task: Research MongoDB agent coordination."**

**[SCREEN: Director status → "working", output starts streaming]**

> **"Watch the Director analyze the task and decompose it into subtasks."**

---

#### Multi-Agent Spawning [1:30 - 1:45]

**[SCREEN: Two Specialist agents spawn with purple accents]**

> **"It spawns Specialists - a researcher and a writer. Each in their own sandbox."**

**[SCREEN: Messages flash-highlight as they flow Director → Specialists]**

> **"See the messages? That's coordination happening through MongoDB. The Director assigns tasks. Specialists acknowledge and execute."**

---

#### Show MongoDB [1:45 - 2:00]

**[ACTION: Gesture to MongoDB Compass or point to Checkpoints panel]**

> **"Every message, every checkpoint - it's all in MongoDB Atlas, right now. Agents sharing context through documents. Coordination you can actually see."**

**[SCREEN: Checkpoints flash-highlight as they're created]**

> **"And as they work, they checkpoint their progress. That's the key to what comes next."**

**[60 seconds total for Act 3]**

---

### ACT 4: THE WOW [2:00 - 2:30]

**[Find a Specialist that's "working"]**

> **"Now here's what makes this different from anything else."**

**[ACTION: Click "Kill" on a working Specialist]**

> **"I just killed that agent mid-task."**

**[SCREEN: Status → "error", sandbox → "killed", Toast: "✅ Checkpoint saved"]**

> **"In any other system, that work is gone. The context is lost. You start over.**
>
> **But watch this."**

**[ACTION: Click "Restart"]**

**[SCREEN: Status → "idle", Output shows "[Resume] Loading checkpoint... Restored context successfully."]**

> **"It loaded its last checkpoint from MongoDB. It knows exactly where it was. It continues from that exact point.**
>
> **That's prolonged coordination. Coordination that survives anything."**

**[30 seconds]**

---

### ACT 5: THE FUTURE [2:30 - 3:00]

**[SCREEN: Task completes, final checkpoint appears]**

> **"The future of AI isn't single agents doing single tasks.**
>
> **It's fleets of agents - coordinating, collaborating, persisting state across sessions, across restarts, across failures.**
>
> **And they need a coordination layer.**

**[Pause for emphasis]**

> **MongoDB is that layer.**
>
> **Coherence. Agents that coordinate. Agents that persist. Agents that actually work together.**
>
> **Thank you."**

**[30 seconds - END AT 3:00]**

---

## Quick Reference Card

### Key Lines to Nail

| Moment | Line |
|--------|------|
| Opening | "Today's AI agents are islands. They can't coordinate." |
| MongoDB value | "MongoDB isn't just our database. It's the nervous system for agent coordination." |
| Before kill | "In any other system, that work is gone." |
| After restart | "That's prolonged coordination. Coordination that survives anything." |
| Close | "Agents that coordinate. Agents that persist. Agents that actually work together." |

### Visual Cues

| What Happens | What Judges See |
|--------------|-----------------|
| Director spawns | Blue left accent on card |
| Specialists spawn | Purple left accents |
| Messages flow | Flash-highlight animation |
| Checkpoints save | Flash-highlight animation |
| Agent killed | Red status, toast notification |
| Agent resumes | "[Resume]" in output stream |

---

## Timing Breakdown

```
0:00 ─────────────── ACT 1: PAIN ─────────────── 0:30
      "Agents are islands. They can't coordinate."

0:30 ─────────────── ACT 2: VISION ────────────── 1:00
      "Prolonged Coordination + Multi-Agent Collaboration"

1:00 ─────────────── ACT 3: PROOF ─────────────── 2:00
      Spawn → Task → Specialists → Messages → Checkpoints

2:00 ─────────────── ACT 4: WOW ───────────────── 2:30
      Kill → "Work is gone" → Restart → "Resumes exactly"

2:30 ─────────────── ACT 5: FUTURE ────────────── 3:00
      "MongoDB is the coordination layer"
```

---

## If Things Go Wrong

| Problem | Recovery |
|---------|----------|
| Agent won't spawn | "Let me reset" → Click Reset → Try again |
| WebSocket disconnects | Point to "MOCK MODE" badge: "We're in demo mode - same behavior" |
| Restart doesn't show resume message | "The checkpoint was saved to MongoDB - on restart it loads that state" |
| Running over time | Skip MongoDB Compass gestures, keep the kill/restart |
| Under time | Expand on MongoDB Compass: "Let me show you the actual documents" |

---

## Judge-Specific Callbacks

If there's Q&A time, have these ready:

**For Jim Scharf (MongoDB CTO):**
> "We chose MongoDB because the document model perfectly matches agent state. Change streams give us real-time coordination. It's not just storage - it's infrastructure."

**For VCs (Anoushka, Philip):**
> "Every company building AI agents will hit this coordination problem. We built the pattern in a day - it's production-ready architecture."

**For Chip Huyen (AI Engineer):**
> "The checkpoint/resume pattern means you can run agents for hours, days - and never lose progress. That changes what's possible."

---

## The One Thing

If judges remember nothing else:

> **"Kill any agent. Restart it. It resumes exactly where it left off. That's MongoDB-powered coordination."**

---

## Final Checklist

```
[ ] Memorized: "Agents are islands" opening
[ ] Memorized: "Nervous system for agent coordination"
[ ] Memorized: "In any other system, that work is gone"
[ ] Practiced kill/restart timing (smooth, not rushed)
[ ] Practiced 3-minute runthrough 2x
[ ] Backup browser tab ready
[ ] Water nearby
[ ] Deep breath before starting
```

---

*You've got this. The demo is solid. The story is clear. Ship it.*
