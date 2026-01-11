# Squad Lite Demo Narrative

## The Story Arc (3 minutes)

```
PAIN → VISION → PROOF → WOW → FUTURE
 30s     30s     60s    30s    30s
```

---

## Know Your Judges

| Judge | Role | What They Care About | Hook For Them |
|-------|------|---------------------|---------------|
| **Jim Scharf** | CTO @ MongoDB | Technical depth, MongoDB as THE solution | "MongoDB IS the coordination layer" |
| **Chenyu Zhao** | Co-Founder @ Fireworks AI | AI infrastructure, model orchestration | "This scales to N agents" |
| **Rocky Yu** | CEO @ AGI House | AI community vision, what's next | "The future of agent collaboration" |
| **Anoushka Vaswani** | Partner @ Lightspeed | Market opportunity, pain points | "Every AI team has this problem" |
| **Philip Clark** | Partner @ Thrive Capital | Scalability, team execution | "Built in one day, production-ready patterns" |
| **Kevin Leffew** | GTM @ Coinbase | Commercialization potential | "Agents need reliable coordination to transact" |
| **Chip Huyen** | AI Engineer @ Stealth | Practical problems, real solutions | "We've all lost context mid-run" |

---

## The Narrative

### [0:00 - 0:30] THE PAIN (Every engineer feels this)

> "Show of hands - who's had an AI agent crash mid-task and lost everything?"

**The Reality Today:**
- Engineers **babysit terminals** watching agents run
- One crash = **start from zero**
- Context is **trapped in memory** - dies with the process
- Multi-agent coordination? **Copy-paste between windows**

> "We built Squad Lite to fix this."

**Visual:** Show the "Demo Mode" helper with the 3 pain points visible

---

### [0:30 - 1:00] THE VISION (What we built)

> "What if agents could **coordinate through MongoDB** - and survive anything?"

**Squad Lite = Two MongoDB superpowers:**

1. **Prolonged Coordination**
   - Agents checkpoint state to MongoDB
   - Kill them. Restart them. They resume exactly where they left off.

2. **Multi-Agent Collaboration**
   - Director + Specialists coordinate via MongoDB message bus
   - Real-time. Persistent. Observable.

> "Let me show you."

**Visual:** Point to Run Status Bar showing "Prolonged Coordination" + "Multi-Agent Collaboration" pills

---

### [1:00 - 2:00] THE PROOF (Live Demo)

**Spawn & Task:**
1. Click "Spawn Director" → Agent card appears with blue accent
2. Submit task: "Research MongoDB agent coordination patterns"
3. Watch Director analyze, spawn Specialists (purple accents)

> "Director decomposes the task. Specialists execute in parallel. All coordinated through MongoDB."

**Show Coordination:**
- Messages flash as they flow between agents
- Checkpoints flash as state persists
- Point to MongoDB Compass: "This is all in Atlas, right now"

**Visual:** New messages/checkpoints flash-highlight so judges see real-time activity

---

### [2:00 - 2:30] THE WOW (Kill/Restart)

> "Now here's what makes this different."

1. Find a working Specialist
2. **"I'm going to kill this agent mid-task."**
3. Click Kill → Toast: "✅ Checkpoint saved"
4. Show MongoDB Compass: checkpoint document with saved state

> "In any other system, that work is gone. But watch this."

5. Click Restart
6. Output shows: "[Resume] Loading checkpoint... Restored context successfully."
7. Agent continues from exact stopping point

> "That's **prolonged coordination**. MongoDB made that possible."

---

### [2:30 - 3:00] THE FUTURE (Close strong)

> "This is how agents will work together."

**For Jim (MongoDB):**
> "MongoDB isn't just storage - it's the **nervous system** for agent coordination."

**For VCs (Anoushka, Philip):**
> "Every company building AI agents will need this. We built it in one day."

**For Chip (practical engineer):**
> "No more babysitting. No more lost context. Agents that actually finish the job."

**Close:**
> "Squad Lite. Prolonged coordination. Multi-agent collaboration. Built on MongoDB."

---

## Visual Story Beats

| Time | What Judges SEE | What They FEEL |
|------|-----------------|----------------|
| 0:00 | Demo helper with pain points | "I know this pain" |
| 0:30 | Run Status Bar with track pills | "Clear focus" |
| 1:00 | Director spawns (blue accent) | "This is organized" |
| 1:15 | Specialists spawn (purple accents) | "Multi-agent is real" |
| 1:30 | Messages flash-highlight | "Real-time coordination!" |
| 1:45 | Checkpoints flash-highlight | "State is persisting" |
| 2:00 | Kill button clicked | "Oh no..." |
| 2:10 | Toast: "Checkpoint saved" | "Oh wait..." |
| 2:20 | Restart → Resume output | "WOW" |
| 2:30 | Task completes | "They actually built it" |

---

## Sound Bites (Memorize These)

**Opening hook:**
> "Who's had an AI agent crash and lost everything?"

**MongoDB value prop:**
> "MongoDB isn't just storage - it's the nervous system for agent coordination."

**Kill/restart moment:**
> "In any other system, that work is gone. But watch this."

**Close:**
> "Agents that coordinate. Agents that persist. Agents that actually finish the job."

---

## Objection Handling

**"This is just a demo with mock data"**
> "The mock mode simulates exact backend behavior. The architecture is production-ready - MongoDB Atlas, E2B sandboxes, real WebSocket coordination."

**"How does this scale?"**
> "MongoDB handles the coordination. We limited to 3 agents for demo clarity, but the architecture supports N agents with the same patterns."

**"What's novel here?"**
> "Checkpointing to MongoDB enables something no one else has: kill any agent, restart it, and it resumes from state. That's prolonged coordination."

**"Why MongoDB specifically?"**
> "Document model matches agent state perfectly. Change streams enable real-time coordination. Atlas scales without ops overhead. It's the natural fit."

---

## Pre-Demo Checklist

- [ ] Demo URL open: https://web-eta-seven-31.vercel.app?mock=true
- [ ] MongoDB Compass open with 3 collections visible
- [ ] Demo helper collapsed (will open to show pain points)
- [ ] Reset demo state clean
- [ ] Practice the kill/restart moment 2x
- [ ] Timer visible (3 min hard stop)

---

## The One Thing Judges Must Remember

> **"Squad Lite: Agents that coordinate through MongoDB and survive anything."**

If they remember nothing else, they remember: **kill/restart with resume**.

---

*Last updated: 2026-01-10*
