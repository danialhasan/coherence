/**
 * Start the Squad Lite API server
 *
 * Pre-checks MongoDB connectivity before starting.
 */

import '../src/config.js'
import { config } from '../src/config.js'
import { connectToMongo, disconnectMongo } from '../src/db/mongo.js'
import { startServer } from '../src/api/server.js'

const MONGO_TIMEOUT_MS = 10000

async function checkMongo(): Promise<boolean> {
  console.log('[Start] Checking MongoDB connection...')

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('MongoDB connection timeout')), MONGO_TIMEOUT_MS)
  })

  try {
    await Promise.race([connectToMongo(), timeoutPromise])
    console.log('[Start] ✅ MongoDB connected!')
    return true
  } catch (error) {
    const err = error as Error
    console.error('[Start] ❌ MongoDB connection failed:', err.message)
    console.error('')
    console.error('Troubleshooting:')
    console.error('  1. Run: pnpm tsx scripts/check-mongo-health.ts')
    console.error('  2. Check MongoDB Atlas dashboard')
    console.error('  3. Verify IP whitelist includes your IP')
    console.error('')
    return false
  }
}

async function main() {
  console.log('[Start] Initializing Squad Lite API...')
  console.log(`[Start] Environment: ${config.NODE_ENV}`)
  console.log('')

  // Pre-check MongoDB
  const mongoOk = await checkMongo()
  if (!mongoOk) {
    process.exit(1)
  }

  // Start server
  try {
    const server = await startServer()
    console.log(`[Start] ✅ Server running on http://${config.HOST}:${config.PORT}`)
    console.log('[Start] Endpoints:')
    console.log(`  GET  /health`)
    console.log(`  POST /api/agents`)
    console.log(`  GET  /api/agents`)
    console.log(`  GET  /api/tasks`)
    console.log(`  GET  /api/messages`)
  } catch (error) {
    console.error('[Start] Failed to start server:', error)
    await disconnectMongo().catch(() => {})
    process.exit(1)
  }
}

main()
