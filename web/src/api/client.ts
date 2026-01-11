import type {
  AgentResponse,
  TaskSubmitResponse,
  KillResponse,
  SandboxResponse,
  MessageResponse,
} from '@/types'
import { isMockMode, mockApi } from './mock'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// ============================================================
// REAL API CLIENT (matches backend ts-rest contract)
// ============================================================

const realApi = {
  agents: {
    list: async (): Promise<{ agents: AgentResponse[] }> => {
      const res = await fetch(`${BASE_URL}/api/agents`)
      if (!res.ok) throw new Error(`Failed to list agents: ${res.status}`)
      return res.json()
    },

    spawn: async (): Promise<AgentResponse> => {
      const res = await fetch(`${BASE_URL}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`Failed to spawn agent: ${res.status}`)
      return res.json()
    },

    submitTask: async (agentId: string, task: string): Promise<TaskSubmitResponse> => {
      const res = await fetch(`${BASE_URL}/api/agents/${agentId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
      if (!res.ok) throw new Error(`Failed to submit task: ${res.status}`)
      return res.json()
    },

    getStatus: async (agentId: string): Promise<AgentResponse> => {
      const res = await fetch(`${BASE_URL}/api/agents/${agentId}/status`)
      if (!res.ok) throw new Error(`Failed to get status: ${res.status}`)
      return res.json()
    },

    kill: async (agentId: string): Promise<KillResponse> => {
      const res = await fetch(`${BASE_URL}/api/agents/${agentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`Failed to kill agent: ${res.status}`)
      return res.json()
    },

    restart: async (agentId: string): Promise<AgentResponse> => {
      const res = await fetch(`${BASE_URL}/api/agents/${agentId}/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`Failed to restart agent: ${res.status}`)
      return res.json()
    },
  },

  messages: {
    list: async (limit = 50): Promise<{ messages: MessageResponse[] }> => {
      const res = await fetch(`${BASE_URL}/api/messages?limit=${limit}`)
      if (!res.ok) throw new Error(`Failed to list messages: ${res.status}`)
      return res.json()
    },
  },

  sandboxes: {
    list: async (): Promise<{ sandboxes: SandboxResponse[] }> => {
      const res = await fetch(`${BASE_URL}/api/sandboxes`)
      if (!res.ok) throw new Error(`Failed to list sandboxes: ${res.status}`)
      return res.json()
    },

    get: async (sandboxId: string): Promise<SandboxResponse> => {
      const res = await fetch(`${BASE_URL}/api/sandboxes/${sandboxId}`)
      if (!res.ok) throw new Error(`Failed to get sandbox: ${res.status}`)
      return res.json()
    },

    pause: async (sandboxId: string): Promise<{ sandboxId: string; status: 'paused' }> => {
      const res = await fetch(`${BASE_URL}/api/sandboxes/${sandboxId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`Failed to pause sandbox: ${res.status}`)
      return res.json()
    },

    resume: async (sandboxId: string): Promise<{ sandboxId: string; status: 'active' }> => {
      const res = await fetch(`${BASE_URL}/api/sandboxes/${sandboxId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`Failed to resume sandbox: ${res.status}`)
      return res.json()
    },

    kill: async (sandboxId: string): Promise<{ sandboxId: string; status: 'killed' }> => {
      const res = await fetch(`${BASE_URL}/api/sandboxes/${sandboxId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`Failed to kill sandbox: ${res.status}`)
      return res.json()
    },
  },
}

// ============================================================
// EXPORT API (switches based on mock mode)
// ============================================================

export const api = isMockMode() ? mockApi : realApi

export { BASE_URL }
