<script setup lang="ts">
import { computed } from 'vue'
import type { AgentResponse, AgentStatus, SandboxStatus } from '@/types'

const props = defineProps<{
  agent: AgentResponse
  selected?: boolean
}>()

const emit = defineEmits<{
  kill: [agentId: string]
  restart: [agentId: string]
  select: [agentId: string]
}>()

// Truncate UUID for display
const shortId = computed(() => props.agent.agentId.slice(0, 8))

// Status class mapping (fixed - no more Tailwind)
const statusClass = computed(() => {
  const classes: Record<AgentStatus, string> = {
    idle: 'status-idle',
    working: 'status-working',
    waiting: 'status-waiting',
    completed: 'status-completed',
    error: 'status-error',
  }
  return classes[props.agent.status]
})

// Sandbox status class
const sandboxClass = computed(() => {
  const classes: Record<SandboxStatus, string> = {
    none: 'sandbox-none',
    active: 'sandbox-active',
    paused: 'sandbox-paused',
    killed: 'sandbox-killed',
  }
  return classes[props.agent.sandboxStatus]
})

// Format timestamp
const formatTime = (iso: string) => {
  const date = new Date(iso)
  return date.toLocaleTimeString()
}

// Is agent killable?
const canKill = computed(() =>
  props.agent.status !== 'completed' &&
  props.agent.status !== 'error' &&
  props.agent.sandboxStatus !== 'killed'
)

// Is agent restartable?
const canRestart = computed(() =>
  props.agent.sandboxStatus === 'killed' ||
  props.agent.status === 'error'
)

const handleKill = () => emit('kill', props.agent.agentId)
const handleRestart = () => emit('restart', props.agent.agentId)
const handleSelect = () => emit('select', props.agent.agentId)
</script>

<template>
  <div
    class="agent-card"
    :class="{ selected: !!selected }"
    :data-type="agent.type"
    @click="handleSelect"
  >
    <!-- Header -->
    <div class="card-header">
      <div class="agent-info">
        <span :class="['status-dot', statusClass]"></span>
        <span class="agent-type">{{ agent.type }}</span>
        <span class="agent-id mono">{{ shortId }}</span>
      </div>
      <span :class="['sandbox-status', sandboxClass]">
        {{ agent.sandboxStatus }}
      </span>
    </div>

    <!-- Body -->
    <div class="card-body">
      <div v-if="agent.specialization" class="stat-row">
        <span class="label">Spec:</span>
        <span class="value specialization">{{ agent.specialization }}</span>
      </div>
      <div class="stat-row">
        <span class="label">Status:</span>
        <span class="value">{{ agent.status }}</span>
      </div>
      <div class="stat-row">
        <span class="label">Sandbox:</span>
        <span class="value mono">{{ agent.sandboxId?.slice(0, 12) || 'none' }}</span>
      </div>
      <div class="stat-row">
        <span class="label">Heartbeat:</span>
        <span class="value mono">{{ formatTime(agent.lastHeartbeat) }}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="card-actions">
      <button
        v-if="canKill"
        class="btn btn-kill"
        @click.stop="handleKill"
      >
        Kill
      </button>
      <button
        v-if="canRestart"
        class="btn btn-restart"
        @click.stop="handleRestart"
      >
        Restart
      </button>
    </div>
  </div>
</template>

<style scoped>
.agent-card {
  background: var(--ctp-mantle);
  border: 1px solid var(--ctp-surface0);
  border-radius: 8px;
  padding: 10px 12px;
  transition: border-color 0.15s ease, background 0.15s ease;
  animation: fadeInUp 0.2s ease-out;
  cursor: pointer;
}

.agent-card:hover {
  border-color: var(--ctp-surface1);
  background: var(--ctp-base);
}

.agent-card.selected {
  border-color: var(--ctp-blue);
  box-shadow: 0 0 0 1px var(--ctp-blue);
}

/* Agent type accent borders */
.agent-card[data-type="director"] {
  border-left: 3px solid var(--ctp-blue);
}

.agent-card[data-type="specialist"] {
  border-left: 3px solid var(--ctp-mauve);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ctp-surface0);
}

.agent-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Status dot styles */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
  flex-shrink: 0;
}

.status-dot.status-idle {
  background: var(--ctp-surface1);
}

.status-dot.status-working {
  background: var(--ctp-blue);
  animation: pulse 1.6s ease-in-out infinite;
}

.status-dot.status-waiting {
  background: var(--ctp-yellow);
}

.status-dot.status-completed {
  background: var(--ctp-green);
}

.status-dot.status-error {
  background: var(--ctp-red);
}

.agent-type {
  font-weight: 600;
  text-transform: capitalize;
  color: var(--ctp-text);
  font-size: 0.9em;
}

.agent-id {
  color: var(--ctp-overlay0);
  font-size: 0.75em;
}

.mono {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

/* Sandbox status styles */
.sandbox-status {
  font-size: 0.7em;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.sandbox-status.sandbox-none {
  color: var(--ctp-overlay0);
}

.sandbox-status.sandbox-active {
  color: var(--ctp-green);
}

.sandbox-status.sandbox-paused {
  color: var(--ctp-yellow);
}

.sandbox-status.sandbox-killed {
  color: var(--ctp-red);
}

.card-body {
  margin-bottom: 8px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 0.8em;
}

.label {
  color: var(--ctp-subtext0);
}

.value {
  color: var(--ctp-text);
  text-align: right;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value.specialization {
  color: var(--ctp-mauve);
  text-transform: capitalize;
  font-weight: 500;
}

.card-actions {
  display: flex;
  gap: 6px;
}

.btn {
  flex: 1;
  padding: 6px 12px;
  border: none;
  border-radius: 5px;
  font-weight: 600;
  font-size: 0.8em;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover:not(:disabled) {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-kill {
  background: var(--ctp-red);
  color: var(--ctp-crust);
}

.btn-restart {
  background: var(--ctp-green);
  color: var(--ctp-crust);
}

/* Animations */
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

@keyframes pulse {
  0%, 100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-card {
    animation: none;
  }
  .status-dot.status-working {
    animation: none;
  }
}
</style>
