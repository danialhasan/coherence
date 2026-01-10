import { MongoClient, Db, Collection } from 'mongodb'
import { z } from 'zod'

// ============================================================
// SCHEMAS (Zod validation for all MongoDB documents)
// ============================================================

export const AgentSchema = z.object({
  agentId: z.string().uuid(),
  type: z.enum(['director', 'specialist']),
  specialization: z.enum(['researcher', 'writer', 'analyst', 'general']).optional(),
  status: z.enum(['idle', 'working', 'waiting', 'completed', 'error']),
  parentId: z.string().uuid().nullable(),
  taskId: z.string().uuid().nullable(),
  createdAt: z.date(),
  lastHeartbeat: z.date(),
})

export const MessageSchema = z.object({
  messageId: z.string().uuid(),
  fromAgent: z.string().uuid(),
  toAgent: z.string().uuid(),
  content: z.string(),
  type: z.enum(['task', 'result', 'status', 'error']),
  threadId: z.string().uuid(),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  readAt: z.date().nullable(),
  createdAt: z.date(),
})

export const CheckpointSchema = z.object({
  checkpointId: z.string().uuid(),
  agentId: z.string().uuid(),
  summary: z.object({
    goal: z.string(),
    completed: z.array(z.string()),
    pending: z.array(z.string()),
    decisions: z.array(z.string()),
  }),
  resumePointer: z.object({
    nextAction: z.string(),
    currentContext: z.string().optional(),
    phase: z.string(),
  }),
  tokensUsed: z.number(),
  createdAt: z.date(),
})

export const TaskSchema = z.object({
  taskId: z.string().uuid(),
  parentTaskId: z.string().uuid().nullable(),
  assignedTo: z.string().uuid().nullable(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'assigned', 'in_progress', 'completed', 'failed']),
  result: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Types derived from schemas
export type Agent = z.infer<typeof AgentSchema>
export type Message = z.infer<typeof MessageSchema>
export type Checkpoint = z.infer<typeof CheckpointSchema>
export type Task = z.infer<typeof TaskSchema>

// ============================================================
// DATABASE CONNECTION
// ============================================================

let client: MongoClient | null = null
let db: Db | null = null

export const connectToMongo = async (): Promise<Db> => {
  if (db) return db

  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is required')
  }

  client = new MongoClient(uri)
  await client.connect()

  const dbName = process.env.MONGODB_DB_NAME || 'squad-lite'
  db = client.db(dbName)

  console.log(`[MongoDB] Connected to ${dbName}`)
  return db
}

export const disconnectMongo = async (): Promise<void> => {
  if (client) {
    await client.close()
    client = null
    db = null
    console.log('[MongoDB] Disconnected')
  }
}

// ============================================================
// COLLECTION ACCESSORS
// ============================================================

export const getAgentsCollection = async (): Promise<Collection<Agent>> => {
  const database = await connectToMongo()
  return database.collection<Agent>('agents')
}

export const getMessagesCollection = async (): Promise<Collection<Message>> => {
  const database = await connectToMongo()
  return database.collection<Message>('messages')
}

export const getCheckpointsCollection = async (): Promise<Collection<Checkpoint>> => {
  const database = await connectToMongo()
  return database.collection<Checkpoint>('checkpoints')
}

export const getTasksCollection = async (): Promise<Collection<Task>> => {
  const database = await connectToMongo()
  return database.collection<Task>('tasks')
}

// ============================================================
// INDEXES (Run once on startup)
// ============================================================

export const ensureIndexes = async (): Promise<void> => {
  const agents = await getAgentsCollection()
  const messages = await getMessagesCollection()
  const checkpoints = await getCheckpointsCollection()
  const tasks = await getTasksCollection()

  await agents.createIndex({ agentId: 1 }, { unique: true })
  await agents.createIndex({ status: 1, lastHeartbeat: -1 })

  await messages.createIndex({ messageId: 1 }, { unique: true })
  await messages.createIndex({ toAgent: 1, readAt: 1, createdAt: -1 })
  await messages.createIndex({ threadId: 1, createdAt: 1 })

  await checkpoints.createIndex({ checkpointId: 1 }, { unique: true })
  await checkpoints.createIndex({ agentId: 1, createdAt: -1 })

  await tasks.createIndex({ taskId: 1 }, { unique: true })
  await tasks.createIndex({ assignedTo: 1, status: 1 })

  console.log('[MongoDB] Indexes ensured')
}
