import { EventEmitter } from 'events'

// ============================================================
// WEBSOCKET HANDLER — Real-time event streaming
// ============================================================

/**
 * Event types for WebSocket communication
 */
export type EventType =
  | 'agent:created'
  | 'agent:status'
  | 'agent:output'
  | 'agent:killed'
  | 'message:new'
  | 'checkpoint:new'
  | 'task:created'
  | 'task:status'
  | 'sandbox:event'

/**
 * WebSocket message structure
 * Note: Uses 'type' instead of 'event' to match frontend expectations
 */
export type WebSocketMessage = {
  type: EventType | 'error' | 'unknown'
  data: Record<string, unknown>
  timestamp: string
}

/**
 * Client command structure
 */
export type ClientCommand =
  | { event: 'agent:spawn'; data: { type: 'director' | 'specialist'; specialization?: string } }
  | { event: 'agent:kill'; data: { agentId: string } }
  | { event: 'agent:restart'; data: { agentId: string } }

// ============================================================
// EVENT EMITTER
// ============================================================

export type SquadEventEmitter = EventEmitter & {
  emit(event: EventType, data: Record<string, unknown>): boolean
  on(event: EventType, listener: (data: Record<string, unknown>) => void): SquadEventEmitter
  off(event: EventType, listener: (data: Record<string, unknown>) => void): SquadEventEmitter
}

/**
 * Create event emitter for WebSocket events
 */
export const createEventEmitter = (): SquadEventEmitter => {
  return new EventEmitter() as SquadEventEmitter
}

// Global event emitter instance
let globalEmitter: SquadEventEmitter | null = null

/**
 * Get or create global event emitter
 */
export const getGlobalEmitter = (): SquadEventEmitter => {
  if (!globalEmitter) {
    globalEmitter = createEventEmitter()
  }
  return globalEmitter
}

// ============================================================
// EVENT HELPERS
// ============================================================

/**
 * Emit event through emitter
 */
export const emitEvent = (
  emitter: SquadEventEmitter,
  event: EventType,
  data: Record<string, unknown>
): void => {
  emitter.emit(event, data)
}

/**
 * Subscribe to event
 */
export const onEvent = (
  emitter: SquadEventEmitter,
  event: EventType,
  callback: (data: Record<string, unknown>) => void
): void => {
  emitter.on(event, callback)
}

/**
 * Unsubscribe from event
 */
export const offEvent = (
  emitter: SquadEventEmitter,
  event: EventType,
  callback: (data: Record<string, unknown>) => void
): void => {
  emitter.off(event, callback)
}

// ============================================================
// MESSAGE FORMATTING
// ============================================================

/**
 * Format event as WebSocket JSON message
 */
export const formatWebSocketMessage = (
  event: EventType,
  data: Record<string, unknown>
): string => {
  const message: WebSocketMessage = {
    type: event, // Changed from 'event' to 'type' to match frontend expectations
    data,
    timestamp: new Date().toISOString(),
  }
  return JSON.stringify(message)
}

/**
 * Parse incoming WebSocket message
 */
export const parseWebSocketMessage = (
  raw: string
): { event: string; data: Record<string, unknown> } => {
  try {
    const parsed = JSON.parse(raw)
    return {
      event: parsed.event || 'unknown',
      data: parsed.data || {},
    }
  } catch (error) {
    return {
      event: 'error',
      data: { error: 'Invalid JSON message' },
    }
  }
}

// ============================================================
// BROADCAST HELPERS
// ============================================================

/**
 * Broadcast event to all connected clients
 */
export const broadcastEvent = (
  clients: Set<{ send: (data: string) => void }>,
  event: EventType,
  data: Record<string, unknown>
): void => {
  const message = formatWebSocketMessage(event, data)
  clients.forEach((client) => {
    try {
      client.send(message)
    } catch (error) {
      console.error('[WebSocket] Failed to send to client:', error)
    }
  })
}

// ============================================================
// EVENT SHORTCUTS
// ============================================================

/**
 * Emit agent created event
 */
export const emitAgentCreated = (
  emitter: SquadEventEmitter,
  agentId: string,
  type: 'director' | 'specialist',
  specialization?: string
): void => {
  emitEvent(emitter, 'agent:created', {
    agentId,
    type,
    specialization,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Emit agent status change
 */
export const emitAgentStatus = (
  emitter: SquadEventEmitter,
  agentId: string,
  status: string
): void => {
  emitEvent(emitter, 'agent:status', {
    agentId,
    status,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Emit agent output (stdout)
 */
export const emitAgentOutput = (
  emitter: SquadEventEmitter,
  agentId: string,
  output: string
): void => {
  emitEvent(emitter, 'agent:output', {
    agentId,
    output,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Emit new message
 */
export const emitNewMessage = (
  emitter: SquadEventEmitter,
  messageId: string,
  fromAgent: string,
  toAgent: string,
  messageType: string,
  preview: string
): void => {
  emitEvent(emitter, 'message:new', {
    messageId,
    fromAgent,
    toAgent,
    messageType,
    preview,
  })
}

/**
 * Emit new checkpoint
 */
export const emitNewCheckpoint = (
  emitter: SquadEventEmitter,
  checkpointId: string,
  agentId: string,
  phase: string,
  timestamp?: string
): void => {
  emitEvent(emitter, 'checkpoint:new', {
    checkpointId,
    agentId,
    phase,
    timestamp: timestamp ?? new Date().toISOString(),
  })
}

/**
 * Emit task created
 */
export const emitTaskCreated = (
  emitter: SquadEventEmitter,
  taskId: string,
  title: string,
  assignedTo?: string
): void => {
  emitEvent(emitter, 'task:created', {
    taskId,
    title,
    assignedTo,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Emit task status change
 */
export const emitTaskStatus = (
  emitter: SquadEventEmitter,
  taskId: string,
  status: string,
  result?: string
): void => {
  emitEvent(emitter, 'task:status', {
    taskId,
    status,
    result,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Emit sandbox event
 */
export const emitSandboxEvent = (
  emitter: SquadEventEmitter,
  sandboxId: string,
  agentId: string,
  event: 'created' | 'paused' | 'resumed' | 'killed'
): void => {
  emitEvent(emitter, 'sandbox:event', {
    sandboxId,
    agentId,
    event,
    timestamp: new Date().toISOString(),
  })
}
