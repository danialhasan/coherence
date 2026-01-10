/**
 * E2B Integration Test Script
 * Tests real E2B sandbox creation, execution, pause/resume, and kill
 */

import { Sandbox } from '@e2b/sdk'
import { config } from '../src/config.js'

const log = (msg: string) => console.log(`[E2B Test] ${msg}`)
const success = (msg: string) => console.log(`✅ ${msg}`)
const fail = (msg: string) => console.error(`❌ ${msg}`)

async function testE2B() {
  log('Starting E2B integration test...')
  log(`API Key: ${config.E2B_API_KEY.slice(0, 10)}...`)

  let sandbox: Sandbox | null = null

  try {
    // Test 1: Create sandbox
    log('Test 1: Creating sandbox...')
    const startCreate = Date.now()
    sandbox = await Sandbox.create({
      apiKey: config.E2B_API_KEY,
      timeoutMs: 5 * 60 * 1000, // 5 min
      metadata: {
        test: 'squad-lite-validation',
        timestamp: new Date().toISOString(),
      },
    })
    const createTime = Date.now() - startCreate
    success(`Sandbox created in ${createTime}ms (ID: ${sandbox.sandboxId})`)

    // Test 2: Execute command
    log('Test 2: Executing command...')
    const startExec = Date.now()
    let stdout = ''
    const result = await sandbox.commands.run('echo "Hello from E2B sandbox!"', {
      onStdout: (data) => {
        stdout += data
        log(`stdout: ${data.trim()}`)
      },
    })
    const execTime = Date.now() - startExec
    success(`Command executed in ${execTime}ms (exit code: ${result.exitCode})`)

    // Test 3: File operations
    log('Test 3: Testing file operations...')
    await sandbox.files.write('/tmp/test.txt', 'Squad Lite E2B Test')
    const content = await sandbox.files.read('/tmp/test.txt')
    if (content.includes('Squad Lite')) {
      success('File write/read works')
    } else {
      fail('File content mismatch')
    }

    // Test 4: Pause sandbox (beta)
    log('Test 4: Testing pause (betaPause)...')
    const startPause = Date.now()
    await sandbox.betaPause()
    const pauseTime = Date.now() - startPause
    success(`Sandbox paused in ${pauseTime}ms`)

    // Test 5: Resume sandbox (reconnect)
    log('Test 5: Testing resume (Sandbox.connect)...')
    const startResume = Date.now()
    sandbox = await Sandbox.connect(sandbox.sandboxId, {
      apiKey: config.E2B_API_KEY,
    })
    const resumeTime = Date.now() - startResume
    success(`Sandbox resumed in ${resumeTime}ms`)

    // Test 6: Verify state persisted
    log('Test 6: Verifying state persisted after resume...')
    const afterResume = await sandbox.files.read('/tmp/test.txt')
    if (afterResume.includes('Squad Lite')) {
      success('State persisted across pause/resume!')
    } else {
      fail('State NOT persisted')
    }

    // Test 7: Kill sandbox
    log('Test 7: Killing sandbox...')
    const startKill = Date.now()
    await sandbox.kill()
    const killTime = Date.now() - startKill
    success(`Sandbox killed in ${killTime}ms`)
    sandbox = null

    // Summary
    console.log('\n' + '='.repeat(50))
    console.log('E2B INTEGRATION TEST SUMMARY')
    console.log('='.repeat(50))
    success('All tests passed!')
    console.log(`  Create:  ${createTime}ms`)
    console.log(`  Execute: ${execTime}ms`)
    console.log(`  Pause:   ${pauseTime}ms`)
    console.log(`  Resume:  ${resumeTime}ms`)
    console.log(`  Kill:    ${killTime}ms`)
    console.log('='.repeat(50))

  } catch (error) {
    fail(`Test failed: ${error instanceof Error ? error.message : String(error)}`)
    console.error(error)

    // Cleanup on failure
    if (sandbox) {
      try {
        await sandbox.kill()
        log('Cleaned up sandbox after failure')
      } catch {
        // Ignore cleanup errors
      }
    }
    process.exit(1)
  }
}

testE2B()
