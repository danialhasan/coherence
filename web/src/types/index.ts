// ============================================================
// FRONTEND TYPES (aligned with backend contracts)
// Source: src/db/mongo.ts + docs/specs/web/SPEC.md
// ============================================================

// ============================================================
// CORE ENUMS (from backend Zod schemas)
// ============================================================

export type AgentStatus = 'idle' | 'working' | 'waiting' | 'completed' | 'error'
export type AgentType = 'director' | 'specialist'
export type Specialization = 'researcher' | 'writer' | 'analyst' | 'general'
export type SandboxStatus = 'none' | 'active' | 'paused' | 'killed'
export type MessageType = 'task' | 'result' | 'status' | 'error'
export type MessagePriority = 'high' | 'normal' | 'low'
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed'

// ============================================================
// AGENT TYPES (from AgentSchema)
// ============================================================

export interface AgentResponse {
  agentId: string
  type: AgentType
  specialization?: Specialization
  status: AgentStatus
  sandboxId: string | null
  sandboxStatus: SandboxStatus
  parentId?: string | null
  taskId?: string | null
  createdAt: string
  lastHeartbeat: string
}

// ============================================================
// MESSAGE TYPES (from MessageSchema)
// ============================================================

export interface Message {
  messageId: string
  fromAgent: string
  toAgent: string
  content: string
  type: MessageType
  threadId: string
  priority: MessagePriority
  readAt: string | null
  createdAt: string
}

// ============================================================
// API MESSAGE RESPONSE (from backend contract)
// ============================================================

export interface MessageResponse {
  messageId: string
  fromAgent: string
  toAgent: string
  content: string
  type: MessageType
  threadId: string | null
  createdAt: string
  read: boolean
}

// ============================================================
// CHECKPOINT TYPES (from CheckpointSchema)
// ============================================================

export interface CheckpointSummary {
  goal: string
  completed: string[]
  pending: string[]
  decisions: string[]
}

export interface ResumePointer {
  nextAction: string
  currentContext?: string
  phase: string
}

export interface Checkpoint {
  checkpointId: string
  agentId: string
  summary: CheckpointSummary
  resumePointer: ResumePointer
  tokensUsed: number
  createdAt: string
}

// ============================================================
// TASK TYPES (from TaskSchema)
// ============================================================

export interface Task {
  taskId: string
  parentTaskId: string | null
  assignedTo: string | null
  title: string
  description: string
  status: TaskStatus
  result: string | null
  createdAt: string
  updatedAt: string
}

// ============================================================
// SANDBOX TYPES (from SandboxTrackingSchema)
// ============================================================

export interface SandboxResponse {
  sandboxId: string
  agentId: string
  status: 'creating' | 'active' | 'paused' | 'resuming' | 'killed'
  metadata: {
    agentType: AgentType
    specialization?: Specialization
    createdBy?: string
  }
  lifecycle: {
    createdAt: string
    pausedAt: string | null
    resumedAt: string | null
    killedAt: string | null
    lastHeartbeat: string
  }
  resources: {
    cpuCount: number
    memoryMB: number
    timeoutMs: number
  }
  costs: {
    estimatedCost: number
    runtimeSeconds: number
  }
}

// ============================================================
// API RESPONSE TYPES (from SPEC.md)
// ============================================================

export interface ErrorResponse {
  error: string
  message: string
  statusCode: number
}

export interface SpawnResponse {
  agentId: string
  sandboxId: string
  status: AgentStatus
}

export interface TaskSubmitResponse {
  taskId: string
  status: 'assigned'
  agentId: string
}

export interface KillResponse {
  agentId: string
  status: 'killed'
  checkpointId: string | null
}

export interface RestartResponse {
  agentId: string
  status: AgentStatus
  resumedFrom: string | null
}

// ============================================================
// WEBSOCKET EVENT TYPES (from SPEC.md)
// ============================================================

export interface WsAgentCreatedEvent {
  type: 'agent:created'
  data: {
    agentId: string
    agentType: AgentType
    specialization?: Specialization
    sandboxId: string | null
  }
}

export interface WsAgentStatusEvent {
  type: 'agent:status'
  data: {
    agentId: string
    status: AgentStatus
    sandboxStatus: SandboxStatus
    taskId?: string | null
  }
}

export interface WsAgentOutputEvent {
  type: 'agent:output'
  data: {
    agentId: string
    stream: 'stdout' | 'stderr'
    content: string
    timestamp: string
  }
}

export interface WsMessageNewEvent {
  type: 'message:new'
  data: {
    messageId: string
    fromAgent: string
    toAgent: string
    messageType: MessageType
    preview: string
  }
}

export interface WsCheckpointNewEvent {
  type: 'checkpoint:new'
  data: {
    checkpointId: string
    agentId: string
    phase: string
    timestamp: string
  }
}

export interface WsSandboxEvent {
  type: 'sandbox:event'
  data: {
    sandboxId: string
    event: 'created' | 'paused' | 'resumed' | 'killed'
    timestamp: string
  }
}

export type WsEvent =
  | WsAgentCreatedEvent
  | WsAgentStatusEvent
  | WsAgentOutputEvent
  | WsMessageNewEvent
  | WsCheckpointNewEvent
  | WsSandboxEvent

// ============================================================
// TYPE GUARDS
// ============================================================

export const isAgentCreatedEvent = (event: WsEvent): event is WsAgentCreatedEvent => {
  return event.type === 'agent:created'
}

export const isAgentStatusEvent = (event: WsEvent): event is WsAgentStatusEvent => {
  return event.type === 'agent:status'
}

export const isAgentOutputEvent = (event: WsEvent): event is WsAgentOutputEvent => {
  return event.type === 'agent:output'
}

export const isMessageNewEvent = (event: WsEvent): event is WsMessageNewEvent => {
  return event.type === 'message:new'
}

export const isCheckpointNewEvent = (event: WsEvent): event is WsCheckpointNewEvent => {
  return event.type === 'checkpoint:new'
}

export const isSandboxEvent = (event: WsEvent): event is WsSandboxEvent => {
  return event.type === 'sandbox:event'
}
