/**
 * Test MongoDB connection
 */

import '../src/config.js' // Load .env first
import { connectToMongo, ensureIndexes, disconnectMongo } from '../src/db/mongo.js'

async function testConnection() {
  console.log('[Test] Connecting to MongoDB...')

  try {
    await connectToMongo()
    console.log('[Test] Connected!')

    await ensureIndexes()
    console.log('[Test] Indexes ensured!')

    await disconnectMongo()
    console.log('[Test] Disconnected!')

    process.exit(0)
  } catch (error) {
    console.error('[Test] Failed:', error)
    process.exit(1)
  }
}

testConnection()
