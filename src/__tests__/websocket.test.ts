import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================
// MOCK SETUP
// ============================================================

vi.mock('../config.js', () => ({
  config: {
    ANTHROPIC_API_KEY: 'sk-ant-mock-api-key',
    E2B_API_KEY: 'mock-e2b-key',
    PORT: 3001,
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://localhost/test',
    MONGODB_DB_NAME: 'squad-lite-test',
  },
}))

// Import after mocks
import {
  createEventEmitter,
  EventType,
  emitEvent,
  onEvent,
  offEvent,
  formatWebSocketMessage,
  parseWebSocketMessage,
} from '../api/websocket.js'

// ============================================================
// WEBSOCKET HANDLER UNIT TESTS
// ============================================================

describe('WebSocket Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================
  // EVENT EMITTER
  // ============================================================

  describe('createEventEmitter()', () => {
    it('creates event emitter', () => {
      const emitter = createEventEmitter()

      expect(emitter).toBeDefined()
      expect(emitter.emit).toBeDefined()
      expect(emitter.on).toBeDefined()
      expect(emitter.off).toBeDefined()
    })
  })

  // ============================================================
  // EVENT EMISSION
  // ============================================================

  describe('emitEvent()', () => {
    it('emits agent:created event', () => {
      const emitter = createEventEmitter()
      const callback = vi.fn()

      emitter.on('agent:created', callback)
      emitter.emit('agent:created', { agentId: 'agent-123', type: 'director' })

      expect(callback).toHaveBeenCalledWith({ agentId: 'agent-123', type: 'director' })
    })

    it('emits agent:status event', () => {
      const emitter = createEventEmitter()
      const callback = vi.fn()

      emitter.on('agent:status', callback)
      emitter.emit('agent:status', { agentId: 'agent-123', status: 'working' })

      expect(callback).toHaveBeenCalledWith({ agentId: 'agent-123', status: 'working' })
    })

    it('emits message:new event', () => {
      const emitter = createEventEmitter()
      const callback = vi.fn()

      emitter.on('message:new', callback)
      emitter.emit('message:new', {
        messageId: 'msg-123',
        fromAgent: 'director-1',
        toAgent: 'specialist-1',
        content: 'Task assigned',
      })

      expect(callback).toHaveBeenCalled()
    })

    it('emits checkpoint:new event', () => {
      const emitter = createEventEmitter()
      const callback = vi.fn()

      emitter.on('checkpoint:new', callback)
      emitter.emit('checkpoint:new', {
        checkpointId: 'cp-123',
        agentId: 'agent-123',
        phase: 'analysis',
      })

      expect(callback).toHaveBeenCalled()
    })
  })

  // ============================================================
  // EVENT SUBSCRIPTION
  // ============================================================

  describe('onEvent() / offEvent()', () => {
    it('subscribes to events', () => {
      const emitter = createEventEmitter()
      const callback = vi.fn()

      onEvent(emitter, 'agent:output', callback)
      emitter.emit('agent:output', { agentId: 'agent-123', output: 'Hello' })

      expect(callback).toHaveBeenCalled()
    })

    it('unsubscribes from events', () => {
      const emitter = createEventEmitter()
      const callback = vi.fn()

      onEvent(emitter, 'agent:output', callback)
      offEvent(emitter, 'agent:output', callback)
      emitter.emit('agent:output', { agentId: 'agent-123', output: 'Hello' })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  // ============================================================
  // MESSAGE FORMATTING
  // ============================================================

  describe('formatWebSocketMessage()', () => {
    it('formats event as JSON string', () => {
      const message = formatWebSocketMessage('agent:created', {
        agentId: 'agent-123',
        type: 'director',
      })

      const parsed = JSON.parse(message)
      expect(parsed.event).toBe('agent:created')
      expect(parsed.data.agentId).toBe('agent-123')
      expect(parsed.timestamp).toBeDefined()
    })

    it('includes timestamp in message', () => {
      const message = formatWebSocketMessage('agent:status', { status: 'working' })
      const parsed = JSON.parse(message)

      expect(parsed.timestamp).toBeDefined()
      expect(new Date(parsed.timestamp).getTime()).toBeGreaterThan(0)
    })
  })

  describe('parseWebSocketMessage()', () => {
    it('parses valid JSON message', () => {
      const raw = JSON.stringify({
        event: 'agent:spawn',
        data: { type: 'director' },
      })

      const parsed = parseWebSocketMessage(raw)

      expect(parsed.event).toBe('agent:spawn')
      expect(parsed.data.type).toBe('director')
    })

    it('handles invalid JSON gracefully', () => {
      const parsed = parseWebSocketMessage('not valid json')

      expect(parsed.event).toBe('error')
      expect(parsed.data.error).toBeDefined()
    })

    it('handles missing event field', () => {
      const raw = JSON.stringify({ data: { foo: 'bar' } })
      const parsed = parseWebSocketMessage(raw)

      expect(parsed.event).toBe('unknown')
    })
  })

  // ============================================================
  // EVENT TYPES
  // ============================================================

  describe('EventType', () => {
    it('defines all required event types', () => {
      const events: EventType[] = [
        'agent:created',
        'agent:status',
        'agent:output',
        'agent:killed',
        'message:new',
        'checkpoint:new',
        'task:created',
        'task:status',
        'sandbox:event',
      ]

      // All event types should be valid strings
      events.forEach((event) => {
        expect(typeof event).toBe('string')
        expect(event.includes(':')).toBe(true)
      })
    })
  })
})
