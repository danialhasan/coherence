<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api } from '@/api/client'
import { createWsClient } from '@/api/websocket'
import { isMockMode, resetMockState } from '@/api/mock'
import AgentCard from '@/components/AgentCard.vue'
import MessageFeed from '@/components/MessageFeed.vue'
import type { Message } from '@/components/MessageFeed.vue'
import CheckpointTimeline from '@/components/CheckpointTimeline.vue'
import type { Checkpoint } from '@/components/CheckpointTimeline.vue'
import DemoControls from '@/components/DemoControls.vue'
import OutputPanel from '@/components/OutputPanel.vue'
import type { OutputLine } from '@/components/OutputPanel.vue'
import type { AgentResponse, WsEvent } from '@/types'

// ============================================================
// STATE
// ============================================================

const agents = ref<AgentResponse[]>([])
const messages = ref<Message[]>([])
const checkpoints = ref<Checkpoint[]>([])
const outputs = ref<OutputLine[]>([])
const isConnected = ref(false)
const error = ref<string | null>(null)
const mockMode = isMockMode()
const messageMap = new Map<string, Message>()
let messagePoller: ReturnType<typeof setInterval> | null = null
const selectedAgentId = ref<string | null>(null)

// ============================================================
// TOAST SYSTEM
// ============================================================

interface Toast {
  id: string
  text: string
  tone: 'ok' | 'warn' | 'bad' | 'info'
}

const toasts = ref<Toast[]>([])

const pushToast = (text: string, tone: Toast['tone'] = 'info') => {
  const id = crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`
  toasts.value.push({ id, text, tone })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 2600)
}

// Watch for checkpoint additions
watch(() => checkpoints.value.length, (newLen, oldLen) => {
  if (newLen > oldLen) {
    pushToast('✅ Checkpoint saved', 'ok')
  }
})

// Watch for connection changes
watch(isConnected, (connected, wasConnected) => {
  if (wasConnected !== undefined) {
    if (connected) {
      pushToast('🟢 Connected', 'ok')
    } else {
      pushToast('🔴 Disconnected', 'bad')
    }
  }
})

// Watch for error messages
watch(() => messages.value.length, (newLen, oldLen) => {
  if (newLen > oldLen) {
    const newest = messages.value[messages.value.length - 1]
    if (newest?.messageType === 'error') {
      pushToast('⚠️ Agent reported an error', 'warn')
    }
  }
})

// ============================================================
// COMPUTED - RUN STATUS BAR
// ============================================================

const workingCount = computed(() =>
  agents.value.filter(a => a.status === 'working').length
)

const lastCheckpointTime = computed(() => {
  if (checkpoints.value.length === 0) return '—'

  const newest = checkpoints.value.reduce((acc, cp) => {
    const accTime = acc ? Date.parse(acc.timestamp) : 0
    const cpTime = Date.parse(cp.timestamp)
    return cpTime > accTime ? cp : acc
  }, null as Checkpoint | null)

  if (!newest) return '—'

  const diffMs = Date.now() - Date.parse(newest.timestamp)
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  return `${Math.floor(diffMin / 60)}h ago`
})

// ============================================================
// WEBSOCKET
// ============================================================

let wsClient: ReturnType<typeof createWsClient> | null = null

const handleWsEvent = (event: WsEvent) => {
  console.log('[WS Event]', event.type, event.data)

  switch (event.type) {
    case 'agent:created': {
      api.agents.getStatus(event.data.agentId).then((agent) => {
        agents.value.push(agent)
      }).catch(console.error)
      break
    }

    case 'agent:status': {
      const idx = agents.value.findIndex(a => a.agentId === event.data.agentId)
      const existing = agents.value[idx]
      if (idx !== -1 && existing) {
        agents.value[idx] = {
          agentId: existing.agentId,
          type: existing.type,
          status: event.data.status,
          sandboxId: existing.sandboxId,
          sandboxStatus: event.data.sandboxStatus,
          createdAt: existing.createdAt,
          lastHeartbeat: existing.lastHeartbeat,
        }
      }
      break
    }

    case 'agent:output': {
      outputs.value.push({
        agentId: event.data.agentId,
        stream: event.data.stream,
        content: event.data.content,
        timestamp: event.data.timestamp,
      })
      break
    }

    case 'message:new': {
      const msg: Message = {
        messageId: event.data.messageId,
        fromAgent: event.data.fromAgent,
        toAgent: event.data.toAgent,
        messageType: event.data.messageType,
        preview: event.data.preview,
        timestamp: new Date().toISOString(),
      }
      messageMap.set(msg.messageId, msg)
      messages.value = Array.from(messageMap.values()).sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      break
    }

    case 'checkpoint:new': {
      checkpoints.value.push({
        checkpointId: event.data.checkpointId,
        agentId: event.data.agentId,
        phase: event.data.phase,
        timestamp: event.data.timestamp,
      })
      break
    }
  }
}

// ============================================================
// API HANDLERS
// ============================================================

const handleSpawn = async () => {
  try {
    error.value = null
    const agent = await api.agents.spawn()
    agents.value.push(agent)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to spawn'
    console.error('Spawn error:', err)
  }
}

const handleSubmitTask = async (task: string) => {
  try {
    error.value = null
    const director = agents.value.find(a => a.type === 'director')
    if (!director) {
      error.value = 'No director agent. Spawn one first.'
      return
    }
    await api.agents.submitTask(director.agentId, task)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to submit task'
    console.error('Submit error:', err)
  }
}

const handleKill = async (agentId: string) => {
  try {
    error.value = null
    await api.agents.kill(agentId)
    const idx = agents.value.findIndex(a => a.agentId === agentId)
    const existing = agents.value[idx]
    if (idx !== -1 && existing) {
      agents.value[idx] = {
        agentId: existing.agentId,
        type: existing.type,
        status: existing.status,
        sandboxId: existing.sandboxId,
        sandboxStatus: 'killed',
        createdAt: existing.createdAt,
        lastHeartbeat: existing.lastHeartbeat,
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to kill agent'
    console.error('Kill error:', err)
  }
}

const handleRestart = async (agentId: string) => {
  try {
    error.value = null
    const agent = await api.agents.restart(agentId)
    const idx = agents.value.findIndex(a => a.agentId === agentId)
    if (idx !== -1) {
      agents.value[idx] = agent
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to restart agent'
    console.error('Restart error:', err)
  }
}

const handleReset = () => {
  agents.value = []
  messages.value = []
  messageMap.clear()
  checkpoints.value = []
  outputs.value = []
  selectedAgentId.value = null
  error.value = null
  if (mockMode) {
    resetMockState()
  }
}

// ============================================================
// MESSAGE SYNC (align frontend to backend API)
// ============================================================

const buildPreview = (content: string) =>
  content.length > 50 ? `${content.slice(0, 50)}...` : content

const loadMessages = async () => {
  const res = await api.messages.list(50)
  for (const msg of res.messages) {
    messageMap.set(msg.messageId, {
      messageId: msg.messageId,
      fromAgent: msg.fromAgent,
      toAgent: msg.toAgent,
      messageType: msg.type,
      preview: buildPreview(msg.content),
      timestamp: msg.createdAt,
    })
  }
  messages.value = Array.from(messageMap.values()).sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
}

const loadAgents = async () => {
  const res = await api.agents.list()
  agents.value = res.agents
}

const handleSelectAgent = (agentId: string) => {
  selectedAgentId.value = agentId
}

const clearFocus = () => {
  selectedAgentId.value = null
}

const focusedMessages = computed(() => {
  if (!selectedAgentId.value) return messages.value
  return messages.value.filter(
    (m) => m.fromAgent === selectedAgentId.value || m.toAgent === selectedAgentId.value
  )
})

// ============================================================
// LIFECYCLE
// ============================================================

onMounted(() => {
  wsClient = createWsClient({
    onEvent: handleWsEvent,
    onConnect: () => { isConnected.value = true },
    onDisconnect: () => { isConnected.value = false },
  })
  wsClient.connect()

  loadAgents().catch(console.error)
  loadMessages().catch(console.error)
  messagePoller = setInterval(() => {
    loadMessages().catch(console.error)
  }, 5000)
})

onUnmounted(() => {
  wsClient?.disconnect()
  if (messagePoller) {
    clearInterval(messagePoller)
    messagePoller = null
  }
})
</script>

<template>
  <div class="dashboard">
    <!-- Toast Stack -->
    <div class="toast-stack" role="status" aria-live="polite">
      <div v-for="t in toasts" :key="t.id" :class="['toast', t.tone]">
        {{ t.text }}
      </div>
    </div>

    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <h1>Coherence</h1>
        <span :class="['connection-status', { connected: isConnected }]">
          {{ isConnected ? 'Connected' : 'Disconnected' }}
        </span>
        <span v-if="mockMode" class="mock-badge">MOCK MODE</span>
      </div>
      <div class="header-right">
        <span class="tagline">MongoDB Agentic Orchestration</span>
      </div>
    </header>

    <!-- Run Status Bar -->
    <div class="runbar">
      <div class="runbar-left">
        <span class="pill subtle">Prolonged Coordination</span>
        <span class="pill subtle">Multi-Agent Collaboration</span>
      </div>
      <div class="runbar-right">
        <div class="kv">
          <span class="k">Agents</span>
          <span class="v">{{ agents.length }}</span>
        </div>
        <div class="kv">
          <span class="k">Working</span>
          <span class="v">{{ workingCount }}</span>
        </div>
        <div class="kv">
          <span class="k">Last CP</span>
          <span class="v mono">{{ lastCheckpointTime }}</span>
        </div>
        <span :class="['pill', isConnected ? 'ok' : 'bad']">
          {{ isConnected ? '● LIVE' : '○ OFFLINE' }}
        </span>
        <span v-if="mockMode" class="pill mock">MOCK</span>
      </div>
    </div>

    <!-- Error Banner -->
    <div v-if="error" class="error-banner">
      {{ error }}
      <button @click="error = null">×</button>
    </div>

    <!-- Main Content: 3-Column Layout -->
    <main class="main-content">
      <!-- Left Column: Agents -->
      <aside class="agents-panel">
        <div class="panel-header">
          <h2>AGENTS</h2>
          <span class="panel-count">{{ agents.length }}</span>
        </div>
        <div class="agents-list">
          <AgentCard
            v-for="agent in agents"
            :key="agent.agentId"
            :agent="agent"
            :selected="agent.agentId === selectedAgentId"
            @select="handleSelectAgent"
            @kill="handleKill"
            @restart="handleRestart"
          />
          <div v-if="agents.length === 0" class="empty-state">
            No agents yet.<br />Click "Spawn Director" to start.
          </div>
        </div>
      </aside>

      <!-- Center Column: Output (main focus) -->
      <section class="output-panel">
        <div class="panel-header">
          <div class="panel-title">
            <h2>{{ selectedAgentId ? 'Conversation' : 'Output' }}</h2>
            <span v-if="selectedAgentId" class="panel-sub mono">
              {{ selectedAgentId.slice(0, 8) }}
            </span>
          </div>
          <div class="panel-actions">
            <button v-if="selectedAgentId" class="btn-link" @click="clearFocus">
              Clear focus
            </button>
            <span v-else class="panel-count">{{ outputs.length }} lines</span>
          </div>
        </div>
        <div v-if="selectedAgentId" class="focused-feed">
          <MessageFeed :messages="focusedMessages" />
        </div>
        <OutputPanel v-else :outputs="outputs" />
      </section>

      <!-- Right Column: Messages + Checkpoints -->
      <aside class="feeds-panel">
        <div class="feed-card">
          <div class="panel-header">
            <h2>Messages</h2>
            <span class="panel-count">{{ messages.length }}</span>
          </div>
          <MessageFeed :messages="messages" />
        </div>
        <div class="feed-card">
          <div class="panel-header">
            <h2>Checkpoints</h2>
            <span class="panel-count">{{ checkpoints.length }}</span>
          </div>
          <CheckpointTimeline :checkpoints="checkpoints" />
        </div>
      </aside>
    </main>

    <!-- Bottom Input Bar (ChatGPT-style) -->
    <footer class="input-bar">
      <DemoControls
        :is-mock-mode="mockMode"
        @spawn="handleSpawn"
        @submit-task="handleSubmitTask"
        @reset="handleReset"
      />
    </footer>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 16px;
  gap: 12px;
}

/* ============================================================
   TOAST STACK
   ============================================================ */

.toast-stack {
  position: fixed;
  top: 14px;
  right: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
}

.toast {
  padding: 10px 14px;
  background: rgba(30, 30, 46, 0.92);
  border: 1px solid var(--ctp-surface0);
  border-radius: 10px;
  backdrop-filter: blur(8px);
  font-weight: 600;
  font-size: 0.9em;
  max-width: 280px;
  animation: fadeInUp 0.2s ease-out;
}

.toast.ok {
  border-color: rgba(166, 227, 161, 0.4);
  color: var(--ctp-green);
}

.toast.warn {
  border-color: rgba(249, 226, 175, 0.4);
  color: var(--ctp-yellow);
}

.toast.bad {
  border-color: rgba(243, 139, 168, 0.4);
  color: var(--ctp-red);
}

.toast.info {
  color: var(--ctp-text);
}

/* ============================================================
   HEADER
   ============================================================ */

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: var(--ctp-base);
  border: 1px solid var(--ctp-surface0);
  border-radius: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header h1 {
  font-size: 1.4em;
  font-weight: 700;
  color: var(--ctp-blue);
}

.connection-status {
  font-size: 0.75em;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--ctp-red);
  color: var(--ctp-crust);
  font-weight: 600;
}

.connection-status.connected {
  background: var(--ctp-green);
}

.mock-badge {
  font-size: 0.7em;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--ctp-peach);
  color: var(--ctp-crust);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.tagline {
  color: var(--ctp-subtext0);
  font-size: 0.85em;
}

/* ============================================================
   RUN STATUS BAR
   ============================================================ */

.runbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--ctp-mantle);
  border: 1px solid var(--ctp-surface0);
  border-radius: 12px;
  gap: 12px;
  flex-wrap: wrap;
}

.runbar-left,
.runbar-right {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.kv {
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.kv .k {
  color: var(--ctp-subtext0);
  font-size: 0.75em;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.kv .v {
  font-weight: 700;
  font-size: 0.9em;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--ctp-surface0);
  font-size: 0.7em;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.pill.subtle {
  color: var(--ctp-subtext0);
}

.pill.ok {
  color: var(--ctp-green);
  border-color: rgba(166, 227, 161, 0.3);
}

.pill.bad {
  color: var(--ctp-red);
  border-color: rgba(243, 139, 168, 0.3);
}

.pill.mock {
  color: var(--ctp-peach);
  border-color: rgba(250, 179, 135, 0.3);
}

.mono {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

/* ============================================================
   ERROR BANNER
   ============================================================ */

.error-banner {
  background: rgba(243, 139, 168, 0.15);
  border: 1px solid var(--ctp-red);
  color: var(--ctp-red);
  padding: 12px 16px;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}

.error-banner button {
  background: none;
  border: none;
  color: var(--ctp-red);
  font-size: 1.2em;
  cursor: pointer;
  padding: 0 4px;
}

/* ============================================================
   MAIN CONTENT - 3-COLUMN LAYOUT
   ============================================================ */

.main-content {
  display: grid;
  grid-template-columns: 280px 1fr 320px;
  gap: 12px;
  flex: 1;
  min-height: 0; /* Important for nested scroll */
  overflow: hidden;
}

/* Panel header styling */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--ctp-surface0);
  flex-shrink: 0;
}

.panel-header h2 {
  font-size: 0.75em;
  color: var(--ctp-subtext0);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  margin: 0;
}

.panel-count {
  font-size: 0.75em;
  color: var(--ctp-overlay0);
  background: var(--ctp-surface0);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

/* Left Column: Agents Panel */
.agents-panel {
  background: var(--ctp-base);
  border: 1px solid var(--ctp-surface0);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.agents-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Center Column: Output Panel */
.output-panel {
  background: var(--ctp-base);
  border: 1px solid var(--ctp-surface0);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.panel-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel-sub {
  font-size: 0.75rem;
  color: var(--ctp-overlay1);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-link {
  background: transparent;
  border: 0;
  color: var(--ctp-sky);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 2px 6px;
}

.btn-link:hover {
  color: var(--ctp-blue);
}

.output-panel > :deep(.output-panel) {
  flex: 1;
  min-height: 0;
  border: none;
  border-radius: 0;
}

.focused-feed {
  flex: 1;
  min-height: 0;
}

/* Right Column: Feeds Panel */
.feeds-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.feed-card {
  background: var(--ctp-base);
  border: 1px solid var(--ctp-surface0);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.feed-card > :deep(.message-feed),
.feed-card > :deep(.checkpoint-timeline) {
  flex: 1;
  min-height: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}

/* Empty state styling */
.empty-state {
  color: var(--ctp-subtext0);
  font-style: italic;
  padding: 24px 16px;
  text-align: center;
  background: var(--ctp-mantle);
  border: 1px dashed var(--ctp-surface0);
  border-radius: 8px;
  font-size: 0.9em;
  line-height: 1.5;
}

/* ============================================================
   BOTTOM INPUT BAR (ChatGPT-style)
   ============================================================ */

.input-bar {
  flex-shrink: 0;
  padding: 12px 0 0;
  background: transparent;
}

.input-bar :deep(.demo-controls) {
  background: var(--ctp-base);
  border: 1px solid var(--ctp-surface0);
  border-radius: 12px;
  padding: 14px 18px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
}

.input-bar :deep(.demo-helper) {
  margin-bottom: 12px;
}

.input-bar :deep(.input-row) {
  display: flex;
  gap: 10px;
  align-items: center;
}

.input-bar :deep(.task-input) {
  flex: 1;
  padding: 12px 16px;
  font-size: 1em;
  border-radius: 8px;
  min-width: 0; /* Allow shrinking */
}

.input-bar :deep(.btn) {
  padding: 12px 18px;
  border-radius: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Responsive: Stack on smaller screens */
@media (max-width: 1200px) {
  .main-content {
    grid-template-columns: 240px 1fr 280px;
  }
}

@media (max-width: 1024px) {
  .main-content {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }

  .agents-panel {
    max-height: 200px;
  }

  .agents-list {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .feeds-panel {
    flex-direction: row;
  }

  .feed-card {
    min-height: 250px;
  }
}

/* ============================================================
   ANIMATIONS
   ============================================================ */

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
  }
}
</style>
