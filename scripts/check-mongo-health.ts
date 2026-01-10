/**
 * MongoDB Health Check Script
 *
 * Diagnoses MongoDB Atlas connectivity issues with clear error messages.
 */

import '../src/config.js'
import { config } from '../src/config.js'
import { MongoClient } from 'mongodb'
import dns from 'dns'
import { promises as dnsPromises } from 'dns'

// Use Google DNS (same as config.ts)
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1'])

const TIMEOUT_MS = 10000

async function checkDNS(hostname: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[DNS] Resolving ${hostname}...`)
    const addresses = await dnsPromises.resolve(hostname)
    console.log(`[DNS] ✅ Resolved to: ${addresses.join(', ')}`)
    return { success: true }
  } catch (error) {
    const err = error as Error
    console.log(`[DNS] ❌ Failed: ${err.message}`)
    return { success: false, error: err.message }
  }
}

async function checkConnection(): Promise<{ success: boolean; error?: string }> {
  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: TIMEOUT_MS,
    connectTimeoutMS: TIMEOUT_MS,
  })

  try {
    console.log(`[MongoDB] Connecting (timeout: ${TIMEOUT_MS}ms)...`)
    await client.connect()
    console.log('[MongoDB] ✅ Connected!')

    // Ping the database
    await client.db().admin().ping()
    console.log('[MongoDB] ✅ Ping successful!')

    await client.close()
    return { success: true }
  } catch (error) {
    const err = error as Error
    console.log(`[MongoDB] ❌ Failed: ${err.message}`)
    await client.close().catch(() => {})
    return { success: false, error: err.message }
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('MongoDB Health Check')
  console.log('='.repeat(60))
  console.log()

  // Extract hostname from URI
  const uriMatch = config.MONGODB_URI.match(/mongodb(\+srv)?:\/\/[^@]+@([^/?]+)/)
  const hostname = uriMatch ? uriMatch[2] : 'unknown'

  console.log(`[Config] Database: ${config.MONGODB_DB_NAME}`)
  console.log(`[Config] Host: ${hostname}`)
  console.log()

  // Step 1: Check DNS
  console.log('--- Step 1: DNS Resolution ---')
  const dnsResult = await checkDNS(hostname)
  console.log()

  if (!dnsResult.success) {
    console.log('='.repeat(60))
    console.log('DIAGNOSIS: DNS Resolution Failed')
    console.log('='.repeat(60))
    console.log()
    console.log('Possible causes:')
    console.log('  1. MongoDB Atlas cluster is paused or deleted')
    console.log('  2. Incorrect cluster hostname in connection string')
    console.log('  3. Network/firewall blocking DNS queries')
    console.log()
    console.log('Suggested actions:')
    console.log('  1. Check MongoDB Atlas dashboard - ensure cluster is running')
    console.log('  2. Verify connection string in .env matches Atlas dashboard')
    console.log('  3. Try from a different network')
    process.exit(1)
  }

  // Step 2: Check MongoDB connection
  console.log('--- Step 2: MongoDB Connection ---')
  const connResult = await checkConnection()
  console.log()

  if (!connResult.success) {
    console.log('='.repeat(60))
    console.log('DIAGNOSIS: MongoDB Connection Failed')
    console.log('='.repeat(60))
    console.log()

    if (connResult.error?.includes('authentication')) {
      console.log('Cause: Authentication failed')
      console.log()
      console.log('Suggested actions:')
      console.log('  1. Verify username/password in connection string')
      console.log('  2. Check user permissions in Atlas')
    } else if (connResult.error?.includes('timeout') || connResult.error?.includes('ETIMEDOUT')) {
      console.log('Cause: Connection timeout (likely IP whitelist issue)')
      console.log()
      console.log('Suggested actions:')
      console.log('  1. Add your IP to MongoDB Atlas Network Access')
      console.log('  2. Or enable "Allow Access from Anywhere" (0.0.0.0/0)')
      console.log()
      console.log('Your current public IP can be found with: curl -s ifconfig.me')
    } else {
      console.log('Cause: Unknown connection error')
      console.log()
      console.log('Error details:', connResult.error)
    }
    process.exit(1)
  }

  // Success!
  console.log('='.repeat(60))
  console.log('✅ MongoDB Health Check PASSED')
  console.log('='.repeat(60))
  console.log()
  console.log('Your MongoDB Atlas connection is working correctly.')
  process.exit(0)
}

main().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
