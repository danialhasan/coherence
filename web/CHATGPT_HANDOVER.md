# ChatGPT Design Handover - Squad Lite Frontend

## Project Context

**Project:** Squad Lite - MongoDB Agentic Orchestration Hackathon Demo
**Event:** MongoDB Hackathon at Shack15, Ferry Building, SF
**Date:** January 10, 2026 (TODAY - judging at 5 PM)
**Team:** Danial (backend) + Shafan (frontend)
**Live URL:** https://web-eta-seven-31.vercel.app
**Demo URL:** https://web-eta-seven-31.vercel.app?mock=true (with mock data)

### What We're Building

A real-time dashboard showing multi-agent AI coordination:
- **Director Agent** spawns and coordinates specialist agents
- **Specialist Agents** (researcher, writer) execute subtasks in parallel
- **Messages** flow between agents in real-time (task assignments, results)
- **Checkpoints** persist agent state to MongoDB (enables kill/restart demo)
- **Output Stream** shows stdout/stderr from all agents

### Demo Flow (3 minutes for judges)
1. Spawn Director agent
2. Submit task ("Research MongoDB agent coordination")
3. Watch Director spawn Specialists
4. See messages flowing between agents
5. Kill an agent mid-task
6. Show checkpoint saved
7. Restart agent - resumes from checkpoint
8. Task completes

---

## Current Tech Stack

- **Framework:** Vue 3 + Vite + TypeScript
- **Styling:** Scoped CSS (no Tailwind)
- **Color Theme:** Catppuccin Mocha (dark theme)
- **Deployment:** Vercel

---

## Catppuccin Mocha Color Palette

```css
/* Base colors */
--ctp-base: #1e1e2e;        /* Card backgrounds */
--ctp-mantle: #181825;      /* Deeper backgrounds (inputs, code) */
--ctp-crust: #11111b;       /* Darkest (page background) */
--ctp-surface0: #313244;    /* Borders, dividers */
--ctp-surface1: #45475a;    /* Hover states, secondary buttons */
--ctp-surface2: #585b70;    /* Disabled states */

/* Text colors */
--ctp-text: #cdd6f4;        /* Primary text */
--ctp-subtext0: #a6adc8;    /* Secondary text (previews, descriptions) */
--ctp-subtext1: #bac2de;    /* Muted text */
--ctp-overlay0: #6c7086;    /* Placeholder text, labels, timestamps */

/* Accent colors */
--ctp-blue: #89b4fa;        /* Primary actions, links, Director color */
--ctp-green: #a6e3a1;       /* Success, completed, restart button */
--ctp-red: #f38ba8;         /* Error, kill button, stderr */
--ctp-yellow: #f9e2af;      /* Warning, waiting status */
--ctp-peach: #fab387;       /* Mock mode badge, accents */
--ctp-mauve: #cba6f7;       /* Specialist accent (alternative) */
--ctp-lavender: #b4befe;    /* Hover states (alternative) */
```

---

## Current Component Files

### 1. App.vue (Main Dashboard)

**Layout:** Header → Error Banner → Controls → Main (Agents Grid | Feeds)

```vue
<template>
  <div class="dashboard">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <h1>Squad Lite</h1>
        <span :class="['connection-status', { connected: isConnected }]">
          {{ isConnected ? 'Connected' : 'Disconnected' }}
        </span>
        <span v-if="mockMode" class="mock-badge">MOCK MODE</span>
      </div>
      <div class="header-right">
        <span class="tagline">MongoDB Agentic Orchestration</span>
      </div>
    </header>

    <!-- Error Banner -->
    <div v-if="error" class="error-banner">
      {{ error }}
      <button @click="error = null">×</button>
    </div>

    <!-- Controls -->
    <DemoControls
      @spawn="handleSpawn"
      @submit-task="handleSubmitTask"
      @reset="handleReset"
    />

    <!-- Main Content: 50/50 Grid -->
    <main class="main-content">
      <!-- Left: Agents -->
      <section class="agents-section">
        <h2>Agents</h2>
        <div class="agents-grid">
          <AgentCard v-for="agent in agents" :key="agent.agentId" :agent="agent" ... />
          <div v-if="agents.length === 0" class="empty-state">
            No agents. Click "Spawn Director" to start.
          </div>
        </div>
      </section>

      <!-- Right: Messages + Checkpoints + Output -->
      <section class="feeds-section">
        <div class="feed-row">  <!-- 50/50 horizontal -->
          <MessageFeed :messages="messages" />
          <CheckpointTimeline :checkpoints="checkpoints" />
        </div>
        <OutputPanel :outputs="outputs" />
      </section>
    </main>
  </div>
</template>
```

**Current CSS Issues:**
- No Inter font loaded
- Fixed 50/50 grid doesn't respond to mobile
- No focus states on interactive elements
- Connection status has low contrast when disconnected

---

### 2. AgentCard.vue

**Purpose:** Displays individual agent with status, type, sandbox info, actions

```vue
<template>
  <div class="agent-card">
    <div class="card-header">
      <div class="agent-info">
        <span :class="['status-dot', statusColor]"></span>
        <span class="agent-type">{{ agent.type }}</span>
        <span class="agent-id">{{ shortId }}</span>
      </div>
      <span :class="['sandbox-status', sandboxColor]">{{ agent.sandboxStatus }}</span>
    </div>
    <div class="card-body">
      <div v-if="agent.specialization" class="stat-row">
        <span class="label">Spec:</span>
        <span class="value specialization">{{ agent.specialization }}</span>
      </div>
      <div class="stat-row">
        <span class="label">Status:</span>
        <span class="value">{{ agent.status }}</span>
      </div>
      <!-- ... more stats -->
    </div>
    <div class="card-actions">
      <button v-if="canKill" class="btn btn-kill" @click="handleKill">Kill</button>
      <button v-if="canRestart" class="btn btn-restart" @click="handleRestart">Restart</button>
    </div>
  </div>
</template>
```

**Current CSS Issues:**
- Status dot uses Tailwind classes (`bg-blue-500`) but no Tailwind installed
- No hover effects on cards
- No entry animations when agents spawn
- No visual distinction between Director and Specialist

---

### 3. DemoControls.vue

**Purpose:** Spawn button, task input, submit button, reset button

```vue
<template>
  <div class="demo-controls">
    <div class="controls-row">
      <button class="btn btn-spawn" :disabled="isSpawning" @click="handleSpawn">
        {{ isSpawning ? 'Spawning...' : 'Spawn Director' }}
      </button>
      <button class="btn btn-reset" @click="handleReset">Reset Demo</button>
    </div>
    <div class="task-input-row">
      <input v-model="taskInput" type="text" placeholder="Enter task for Director..." class="task-input" @keyup.enter="handleSubmit" />
      <button class="btn btn-submit" :disabled="!taskInput.trim() || isSubmitting" @click="handleSubmit">
        {{ isSubmitting ? 'Submitting...' : 'Submit Task' }}
      </button>
    </div>
  </div>
</template>
```

**Current Issues:**
- No loading spinner during spawn/submit
- Disabled state is just opacity (hard to see)
- No success feedback after actions

---

### 4. MessageFeed.vue

**Purpose:** Real-time message stream with auto-scroll

```vue
<template>
  <div class="message-feed">
    <div class="feed-header">
      <h3>Messages</h3>
      <span class="count">{{ messages.length }}</span>
    </div>
    <div ref="feedRef" class="feed-content">
      <div v-for="msg in messages" :key="msg.messageId" class="message-item">
        <div class="message-header">
          <span :class="['type-icon', typeConfig[msg.messageType].color]">
            {{ typeConfig[msg.messageType].icon }}
          </span>
          <span class="agents">{{ shortId(msg.fromAgent) }} → {{ shortId(msg.toAgent) }}</span>
          <span class="timestamp">{{ formatTime(msg.timestamp) }}</span>
        </div>
        <div class="message-preview">{{ msg.preview }}</div>
      </div>
      <div v-if="messages.length === 0" class="empty-state">No messages yet</div>
    </div>
  </div>
</template>
```

**Type icons:** → (task), ✓ (result), ℹ (status), ✗ (error)

**Current Issues:**
- No entry animation for new messages
- Type icon colors defined inline but could be more visible

---

### 5. CheckpointTimeline.vue

**Purpose:** Vertical timeline of checkpoint events

```vue
<template>
  <div class="checkpoint-timeline">
    <div class="timeline-header">
      <h3>Checkpoints</h3>
      <span class="count">{{ checkpoints.length }}</span>
    </div>
    <div class="timeline-content">
      <div v-for="cp in sortedCheckpoints" :key="cp.checkpointId" :class="['checkpoint-item', { 'is-kill': isKillCheckpoint(cp.phase) }]">
        <div class="checkpoint-dot"></div>
        <div class="checkpoint-info">
          <div class="checkpoint-header">
            <span class="agent-id">{{ shortId(cp.agentId) }}</span>
            <span class="timestamp">{{ formatTime(cp.timestamp) }}</span>
          </div>
          <div class="checkpoint-phase">{{ cp.phase }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
```

**Current:** Has nice vertical line visual, kill checkpoints highlighted in red

---

### 6. OutputPanel.vue

**Purpose:** Terminal-style stdout/stderr stream

```vue
<template>
  <div class="output-panel">
    <div class="panel-header">
      <h3>Output</h3>
      <span class="count">{{ filteredOutputs.length }} lines</span>
    </div>
    <div ref="outputRef" class="panel-content">
      <div v-for="(line, idx) in filteredOutputs" :key="..." :class="['output-line', { 'is-stderr': line.stream === 'stderr' }]">
        <span class="line-prefix">[{{ shortId(line.agentId) }}]</span>
        <span class="line-content">{{ line.content }}</span>
      </div>
    </div>
  </div>
</template>
```

**Current:** Monospace font, stderr highlighted in red, auto-scrolls

---

## UI/UX Issues Identified (Priority Order)

### CRITICAL (Accessibility)

| Issue | Current | Recommended Fix |
|-------|---------|-----------------|
| No focus states | Buttons have no visible focus ring | Add `outline: 2px solid #89b4fa; outline-offset: 2px` on `:focus-visible` |
| No keyboard navigation | Can't tab through interface | Add `tabindex` and keyboard handlers |
| Low contrast labels | `#6c7086` on `#1e1e2e` = 3.2:1 | Use `#a6adc8` for 4.5:1 ratio |
| Color-only status | Status dot only indicates state | Add text label or icon alongside dot |
| No ARIA labels | Buttons lack accessible names | Add `aria-label` to icon-only buttons |

### HIGH (Feedback & States)

| Issue | Current | Recommended Fix |
|-------|---------|-----------------|
| No loading indicators | Just text "Spawning..." | Add spinner SVG animation |
| No skeleton loaders | Empty state shows instantly | Add pulsing skeleton while loading |
| No confirmation dialogs | Kill action is immediate | Add "Are you sure?" modal for Kill |
| No success toasts | No feedback after actions | Add toast notification system |

### MEDIUM (Visual Polish)

| Issue | Current | Recommended Fix |
|-------|---------|-----------------|
| Status dot colors broken | Uses Tailwind classes without Tailwind | Replace with inline CSS colors |
| No card hover effects | Cards are static | Add `transform: translateY(-2px)` + shadow on hover |
| No entry animations | Elements appear instantly | Add `@keyframes fadeInUp` for new items |
| No shadows | Flat design lacks depth | Add subtle `box-shadow` to cards |
| Inter font not loaded | Falls back to system font | Add `<link>` to Google Fonts Inter |

### LOW (Typography & Responsive)

| Issue | Current | Recommended Fix |
|-------|---------|-----------------|
| Fixed grid layout | 50/50 split on all screens | Add `@media (max-width: 1024px)` to stack vertically |
| Line heights | Default values | Increase to 1.6 for body text |
| Font loading | No explicit font | Load Inter from Google Fonts |

---

## Specific Implementation Requests

### Request 1: Fix Status Dot Colors (Quick Fix)

In `AgentCard.vue`, replace Tailwind classes with CSS colors:

```typescript
// BEFORE (broken - no Tailwind)
const statusColor = computed(() => {
  const colors: Record<AgentStatus, string> = {
    idle: 'bg-gray-500',
    working: 'bg-blue-500 animate-pulse',
    // ...
  }
})

// AFTER (fix)
const statusColor = computed(() => {
  const colors: Record<AgentStatus, string> = {
    idle: 'status-idle',
    working: 'status-working',
    waiting: 'status-waiting',
    completed: 'status-completed',
    error: 'status-error',
  }
})
```

Add CSS:
```css
.status-dot.status-idle { background: #45475a; }
.status-dot.status-working { background: #89b4fa; animation: pulse 2s infinite; }
.status-dot.status-waiting { background: #f9e2af; }
.status-dot.status-completed { background: #a6e3a1; }
.status-dot.status-error { background: #f38ba8; }
```

### Request 2: Add Loading Spinner Component

Create `LoadingSpinner.vue`:
```vue
<template>
  <svg class="spinner" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="31.4 31.4" />
  </svg>
</template>

<style scoped>
.spinner {
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
```

### Request 3: Add Card Hover Effects

```css
.agent-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.agent-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}
```

### Request 4: Add Entry Animations

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.agent-card {
  animation: fadeInUp 0.3s ease-out;
}

.message-item {
  animation: fadeInUp 0.2s ease-out;
}
```

### Request 5: Add Focus States

```css
.btn:focus-visible {
  outline: 2px solid #89b4fa;
  outline-offset: 2px;
}

.task-input:focus-visible {
  outline: 2px solid #89b4fa;
  outline-offset: 2px;
  border-color: transparent;
}
```

### Request 6: Load Inter Font

In `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

In CSS:
```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.agent-id, .line-prefix, .value {
  font-family: 'JetBrains Mono', 'Monaco', 'Menlo', monospace;
}
```

### Request 7: Visual Distinction for Agent Types

```css
.agent-card[data-type="director"] {
  border-left: 3px solid #89b4fa;
}

.agent-card[data-type="specialist"] {
  border-left: 3px solid #cba6f7;
}
```

In template:
```vue
<div class="agent-card" :data-type="agent.type">
```

---

## Quick Fix Bundle (30 min implementation)

If short on time, prioritize these 5 fixes:

1. **Fix status dot colors** - Replace Tailwind classes with CSS
2. **Add hover effects** - `transform` + `box-shadow` on cards
3. **Add focus states** - `outline` on `:focus-visible`
4. **Load Inter font** - Add Google Fonts link
5. **Add entry animations** - `@keyframes fadeInUp`

---

## Files to Modify

| File | Changes |
|------|---------|
| `web/index.html` | Add Inter font link |
| `web/src/App.vue` | Add body font family, focus states |
| `web/src/components/AgentCard.vue` | Fix status colors, add hover, add animations, add type distinction |
| `web/src/components/DemoControls.vue` | Add loading spinner, focus states |
| `web/src/components/MessageFeed.vue` | Add entry animations |
| `web/src/components/CheckpointTimeline.vue` | Add entry animations |

---

## Questions for Decision

1. **Confirmation dialogs:** Do we need "Are you sure?" before Kill? (Adds complexity)
2. **Toast notifications:** Worth adding for success feedback? (Adds new component)
3. **Responsive breakpoint:** Stack at 1024px or 768px?
4. **Agent type colors:** Blue for Director, Purple for Specialist - okay?

---

## End Goal

A polished, accessible dashboard that:
- Looks professional for hackathon judges
- Has smooth animations that demonstrate real-time updates
- Is keyboard navigable with visible focus states
- Uses consistent Catppuccin color palette
- Loads quickly with proper font loading

**Time budget:** 30-90 minutes depending on scope chosen
