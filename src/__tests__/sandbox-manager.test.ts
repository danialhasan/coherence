import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { SandboxConfig, SandboxInstance, SandboxManager, CommandOptions } from '../contracts/sandbox-manager.contract.js'
import { SandboxNotFoundError, SandboxCreationError } from '../contracts/sandbox-manager.contract.js'

// ============================================================
// MOCK SETUP - vi.mock calls are hoisted to top
// ============================================================

// Mock Sandbox class (vi.hoisted ensures variables are available)
const { mockSandboxCreate, mockSandboxConnect, createMockSandbox, mockCollection } = vi.hoisted(() => {
  const mockSandboxCreate = vi.fn()
  const mockSandboxConnect = vi.fn()

  const createMockSandbox = (sandboxId: string) => ({
    sandboxId,
    commands: {
      run: vi.fn().mockImplementation(async (cmd: string, opts: any) => {
        if (opts?.onStdout) {
          if (cmd.includes('echo')) {
            const match = cmd.match(/echo\s+"?([^"]+)"?/)
            if (match) opts.onStdout(match[1] + '\n')
          }
          if (cmd === 'pwd') {
            opts.onStdout((opts.cwd || '/home/user') + '\n')
          }
          if (cmd.includes('cat')) {
            opts.onStdout('test\n')
          }
        }
        if (opts?.onStderr && cmd.includes('>&2')) {
          opts.onStderr('error\n')
        }
        return { exitCode: 0 }
      }),
    },
    betaPause: vi.fn().mockResolvedValue(true),
    kill: vi.fn().mockResolvedValue(undefined),
  })

  const mockCollection = {
    updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    findOne: vi.fn().mockResolvedValue(null),
  }

  return { mockSandboxCreate, mockSandboxConnect, createMockSandbox, mockCollection }
})

vi.mock('@e2b/sdk', () => ({
  Sandbox: {
    create: (...args: any[]) => mockSandboxCreate(...args),
    connect: (...args: any[]) => mockSandboxConnect(...args),
  },
}))

vi.mock('../config.js', () => ({
  config: {
    E2B_API_KEY: 'mock-e2b-api-key',
    MONGODB_URI: 'mongodb://localhost:27017',
    MONGODB_DB_NAME: 'squad-lite-test',
    ANTHROPIC_API_KEY: 'mock-anthropic-key',
    PORT: 3001,
    HOST: '0.0.0.0',
    NODE_ENV: 'test',
  },
}))

vi.mock('../db/mongo.js', () => ({
  getSandboxTrackingCollection: vi.fn().mockResolvedValue(mockCollection),
}))

// Import after mocks
import { createSandboxManager } from '../sandbox/manager.js'

// ============================================================
// SANDBOX MANAGER UNIT TESTS
// ============================================================

describe('SandboxManager', () => {
  let manager: SandboxManager
  let sandboxCounter: number

  beforeEach(() => {
    vi.clearAllMocks()
    sandboxCounter = 0

    mockSandboxCreate.mockImplementation(async () => {
      sandboxCounter++
      return createMockSandbox(`mock-sandbox-${sandboxCounter}`)
    })

    mockSandboxConnect.mockImplementation(async (sandboxId: string) => {
      return createMockSandbox(sandboxId)
    })

    manager = createSandboxManager()
  })

  afterEach(async () => {
    const instances = manager.list()
    for (const instance of instances) {
      await manager.kill(instance.agentId)
    }
  })

  // ============================================================
  // FACTORY TESTS
  // ============================================================

  describe('createSandboxManager()', () => {
    it('returns manager object with all required methods', () => {
      expect(manager).toBeDefined()
      expect(typeof manager.create).toBe('function')
      expect(typeof manager.execute).toBe('function')
      expect(typeof manager.pause).toBe('function')
      expect(typeof manager.resume).toBe('function')
      expect(typeof manager.kill).toBe('function')
      expect(typeof manager.get).toBe('function')
      expect(typeof manager.list).toBe('function')
      expect(typeof manager.isRunning).toBe('function')
    })

    it('starts with empty sandbox list', () => {
      expect(manager.list()).toEqual([])
    })
  })

  // ============================================================
  // CREATE TESTS
  // ============================================================

  describe('create()', () => {
    it('creates sandbox and returns SandboxInstance', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        agentType: 'director',
      }

      const instance = await manager.create(config)

      expect(instance).toBeDefined()
      expect(instance.agentId).toBe(config.agentId)
      expect(instance.sandboxId).toBeTruthy()
      expect(instance.status).toBe('active')
      expect(instance.sandbox).toBeDefined()
      expect(instance.createdAt).toBeInstanceOf(Date)
      expect(instance.lastHeartbeat).toBeInstanceOf(Date)
    })

    it('stores instance in internal map', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        agentType: 'specialist',
        specialization: 'researcher',
      }

      await manager.create(config)

      expect(manager.get(config.agentId)).toBeDefined()
      expect(manager.list().length).toBe(1)
    })

    it('syncs to MongoDB sandbox_tracking collection', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440002',
        agentType: 'director',
      }

      await manager.create(config)

      expect(mockCollection.updateOne).toHaveBeenCalled()
      const call = mockCollection.updateOne.mock.calls[0]
      expect(call[0]).toHaveProperty('sandboxId')
      expect(call[1].$set).toHaveProperty('agentId', config.agentId)
      expect(call[1].$set).toHaveProperty('status', 'active')
    })

    it('calls E2B Sandbox.create with correct parameters', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440003',
        agentType: 'specialist',
        specialization: 'analyst',
        timeoutMs: 5 * 60 * 1000,
      }

      await manager.create(config)

      expect(mockSandboxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'mock-e2b-api-key',
          timeoutMs: 5 * 60 * 1000,
          metadata: expect.objectContaining({
            agentId: config.agentId,
            agentType: config.agentType,
          }),
        })
      )
    })
  })

  // ============================================================
  // EXECUTE TESTS
  // ============================================================

  describe('execute()', () => {
    it('executes command and returns result', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440010',
        agentType: 'director',
      }
      await manager.create(config)

      const result = await manager.execute(config.agentId, 'echo "hello world"')

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('hello world')
      expect(result.error).toBe(false)
    })

    it('streams stdout via callback', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440011',
        agentType: 'specialist',
      }
      await manager.create(config)

      const chunks: string[] = []
      const options: CommandOptions = {
        onStdout: (data) => chunks.push(data),
      }

      await manager.execute(config.agentId, 'echo "line1"', options)

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.join('')).toContain('line1')
    })

    it('streams stderr via callback', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440012',
        agentType: 'specialist',
      }
      await manager.create(config)

      const errors: string[] = []
      const options: CommandOptions = {
        onStderr: (data) => errors.push(data),
      }

      await manager.execute(config.agentId, 'echo "error" >&2', options)

      expect(errors.length).toBeGreaterThan(0)
      expect(errors.join('')).toContain('error')
    })

    it('throws SandboxNotFoundError for unknown agent', async () => {
      await expect(
        manager.execute('unknown-agent-id', 'echo hello')
      ).rejects.toThrow(SandboxNotFoundError)
    })

    it('respects cwd option', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440013',
        agentType: 'director',
      }
      await manager.create(config)

      const result = await manager.execute(config.agentId, 'pwd', { cwd: '/tmp' })

      expect(result.stdout).toContain('/tmp')
    })
  })

  // ============================================================
  // PAUSE TESTS
  // ============================================================

  describe('pause()', () => {
    it('pauses sandbox and updates status', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440020',
        agentType: 'specialist',
      }
      await manager.create(config)

      await manager.pause(config.agentId)

      const instance = manager.get(config.agentId)
      expect(instance?.status).toBe('paused')
    })

    it('calls E2B betaPause()', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440021',
        agentType: 'director',
      }
      const instance = await manager.create(config)

      await manager.pause(config.agentId)

      expect(instance.sandbox.betaPause).toHaveBeenCalled()
    })

    it('syncs paused status to MongoDB', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440022',
        agentType: 'director',
      }
      await manager.create(config)
      vi.clearAllMocks()

      await manager.pause(config.agentId)

      expect(mockCollection.updateOne).toHaveBeenCalled()
      const call = mockCollection.updateOne.mock.calls[0]
      expect(call[1].$set).toHaveProperty('status', 'paused')
      expect(call[1].$set.lifecycle).toHaveProperty('pausedAt')
    })

    it('throws SandboxNotFoundError for unknown agent', async () => {
      await expect(
        manager.pause('unknown-agent-id')
      ).rejects.toThrow(SandboxNotFoundError)
    })
  })

  // ============================================================
  // RESUME TESTS
  // ============================================================

  describe('resume()', () => {
    it('resumes paused sandbox and updates status', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440030',
        agentType: 'specialist',
      }
      await manager.create(config)
      await manager.pause(config.agentId)

      await manager.resume(config.agentId)

      const instance = manager.get(config.agentId)
      expect(instance?.status).toBe('active')
    })

    it('calls E2B Sandbox.connect()', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440031',
        agentType: 'director',
      }
      const instance = await manager.create(config)
      await manager.pause(config.agentId)

      await manager.resume(config.agentId)

      expect(mockSandboxConnect).toHaveBeenCalledWith(
        instance.sandboxId,
        expect.objectContaining({ apiKey: 'mock-e2b-api-key' })
      )
    })

    it('syncs resumed status to MongoDB', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440032',
        agentType: 'specialist',
      }
      await manager.create(config)
      await manager.pause(config.agentId)
      vi.clearAllMocks()

      await manager.resume(config.agentId)

      expect(mockCollection.updateOne).toHaveBeenCalled()
      const call = mockCollection.updateOne.mock.calls[0]
      expect(call[1].$set).toHaveProperty('status', 'active')
      expect(call[1].$set.lifecycle).toHaveProperty('resumedAt')
    })

    it('throws SandboxNotFoundError for unknown agent', async () => {
      await expect(
        manager.resume('unknown-agent-id')
      ).rejects.toThrow(SandboxNotFoundError)
    })
  })

  // ============================================================
  // KILL TESTS
  // ============================================================

  describe('kill()', () => {
    it('kills sandbox and removes from map', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440040',
        agentType: 'specialist',
      }
      await manager.create(config)

      await manager.kill(config.agentId)

      const instance = manager.get(config.agentId)
      expect(instance).toBeUndefined()
    })

    it('calls E2B sandbox.kill()', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440041',
        agentType: 'director',
      }
      const instance = await manager.create(config)

      await manager.kill(config.agentId)

      expect(instance.sandbox.kill).toHaveBeenCalled()
    })

    it('syncs killed status to MongoDB', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440042',
        agentType: 'director',
      }
      await manager.create(config)
      vi.clearAllMocks()

      await manager.kill(config.agentId)

      expect(mockCollection.updateOne).toHaveBeenCalled()
      const call = mockCollection.updateOne.mock.calls[0]
      expect(call[1].$set).toHaveProperty('status', 'killed')
      expect(call[1].$set.lifecycle).toHaveProperty('killedAt')
    })

    it('handles kill on non-existent agent gracefully', async () => {
      await expect(manager.kill('unknown-agent-id')).resolves.not.toThrow()
    })

    it('removes from internal map after kill', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440043',
        agentType: 'specialist',
      }
      await manager.create(config)
      expect(manager.list().length).toBe(1)

      await manager.kill(config.agentId)

      expect(manager.list().length).toBe(0)
      expect(manager.isRunning(config.agentId)).toBe(false)
    })
  })

  // ============================================================
  // QUERY TESTS
  // ============================================================

  describe('get()', () => {
    it('returns instance for valid agentId', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440050',
        agentType: 'director',
      }
      await manager.create(config)

      const instance = manager.get(config.agentId)

      expect(instance).toBeDefined()
      expect(instance?.agentId).toBe(config.agentId)
    })

    it('returns undefined for unknown agentId', () => {
      const instance = manager.get('unknown-agent-id')
      expect(instance).toBeUndefined()
    })
  })

  describe('list()', () => {
    it('returns all active instances', async () => {
      await manager.create({ agentId: 'agent-1', agentType: 'director' })
      await manager.create({ agentId: 'agent-2', agentType: 'specialist' })
      await manager.create({ agentId: 'agent-3', agentType: 'specialist' })

      const instances = manager.list()

      expect(instances.length).toBe(3)
      expect(instances.map(i => i.agentId)).toContain('agent-1')
      expect(instances.map(i => i.agentId)).toContain('agent-2')
      expect(instances.map(i => i.agentId)).toContain('agent-3')
    })

    it('excludes killed instances', async () => {
      await manager.create({ agentId: 'agent-alive', agentType: 'director' })
      await manager.create({ agentId: 'agent-dead', agentType: 'specialist' })
      await manager.kill('agent-dead')

      const instances = manager.list()

      expect(instances.length).toBe(1)
      expect(instances[0].agentId).toBe('agent-alive')
    })
  })

  describe('isRunning()', () => {
    it('returns true for active sandbox', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440060',
        agentType: 'director',
      }
      await manager.create(config)

      expect(manager.isRunning(config.agentId)).toBe(true)
    })

    it('returns true for paused sandbox', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440061',
        agentType: 'specialist',
      }
      await manager.create(config)
      await manager.pause(config.agentId)

      expect(manager.isRunning(config.agentId)).toBe(true)
    })

    it('returns false for killed sandbox', async () => {
      const config: SandboxConfig = {
        agentId: '550e8400-e29b-41d4-a716-446655440062',
        agentType: 'specialist',
      }
      await manager.create(config)
      await manager.kill(config.agentId)

      expect(manager.isRunning(config.agentId)).toBe(false)
    })

    it('returns false for unknown agentId', () => {
      expect(manager.isRunning('unknown-agent-id')).toBe(false)
    })
  })
})

// ============================================================
// ERROR HANDLING TESTS
// ============================================================

describe('SandboxManager Error Handling', () => {
  let manager: SandboxManager

  beforeEach(() => {
    vi.clearAllMocks()
    mockSandboxCreate.mockImplementation(async () => createMockSandbox('mock-sandbox'))
    manager = createSandboxManager()
  })

  afterEach(async () => {
    for (const instance of manager.list()) {
      await manager.kill(instance.agentId)
    }
  })

  it('throws SandboxCreationError when E2B fails', async () => {
    mockSandboxCreate.mockRejectedValueOnce(new Error('E2B API error'))

    const config: SandboxConfig = {
      agentId: '550e8400-e29b-41d4-a716-446655440070',
      agentType: 'director',
    }

    await expect(manager.create(config)).rejects.toThrow(SandboxCreationError)
  })

  it('throws SandboxNotFoundError for execute on killed sandbox', async () => {
    const config: SandboxConfig = {
      agentId: '550e8400-e29b-41d4-a716-446655440071',
      agentType: 'director',
    }
    await manager.create(config)
    await manager.kill(config.agentId)

    await expect(
      manager.execute(config.agentId, 'echo hello')
    ).rejects.toThrow(SandboxNotFoundError)
  })
})
