import 'dotenv/config'
import { connectToMongo, ensureIndexes } from '../src/db/mongo.js'

async function main() {
  const db = await connectToMongo()
  const sandboxTracking = db.collection('sandbox_tracking')

  console.log('Current indexes:')
  const indexes = await sandboxTracking.indexes()
  console.log(JSON.stringify(indexes, null, 2))

  // Drop old sandboxId_1 index if it exists
  try {
    await sandboxTracking.dropIndex('sandboxId_1')
    console.log('Dropped old sandboxId_1 index')
  } catch (e) {
    console.log('No sandboxId_1 index to drop:', (e as Error).message)
  }

  // Re-ensure indexes
  await ensureIndexes()
  console.log('Indexes ensured')

  const newIndexes = await sandboxTracking.indexes()
  console.log('New indexes:')
  console.log(JSON.stringify(newIndexes, null, 2))

  process.exit(0)
}
main().catch(console.error)
