/**
 * AGENT BUNDLE — Code that runs INSIDE the E2B sandbox
 *
 * This module defines all the code that gets deployed to E2B sandboxes.
 * Each agent runs as a separate process inside a single shared sandbox.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                       E2B SANDBOX                                │
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
 * │  │ Director        │  │ Specialist      │  │ Specialist      │  │
 * │  │ (process 1)     │  │ (process 2)     │  │ (process 3)     │  │
 * │  │                 │  │                 │  │                 │  │
 * │  │ Claude SDK      │  │ Claude SDK      │  │ Claude SDK      │  │
 * │  │ MongoDB Client  │  │ MongoDB Client  │  │ MongoDB Client  │  │
 * │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
 * │                                                                  │
 * │  stdout/stderr ────────────────────────────────────────────────▶│ WebSocket
 * └─────────────────────────────────────────────────────────────────┘
 */

// ============================================================
// AGENT RUNNER SCRIPT (runs inside E2B)
// ============================================================

/**
 * This is the script that gets written to E2B sandbox and executed.
 * It receives configuration via command line args and environment variables.
 */
export const AGENT_RUNNER_SCRIPT = `// Agent Runner - Runs inside E2B sandbox (ESM module)
// NOTE: No shebang - file is run with 'node' explicitly
// Usage: node agent-runner.js --agentId <id> --agentType <director|specialist> --task <task>

import Anthropic from '@anthropic-ai/sdk';
import { MongoClient } from 'mongodb';

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf('--' + name);
  return idx !== -1 ? args[idx + 1] : null;
};

const config = {
  agentId: getArg('agentId'),
  agentType: getArg('agentType') || 'specialist',
  specialization: getArg('specialization') || 'general',
  // Read task from environment variable to prevent command injection
  task: process.env.AGENT_TASK || getArg('task'),
  parentId: getArg('parentId'),
};

// Environment variables (passed from main process)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'squad-lite';

if (!config.agentId || !config.task) {
  console.error('[Agent] Missing required arguments: agentId, task');
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error('[Agent] Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error('[Agent] Missing MONGODB_URI');
  process.exit(1);
}

// ============================================================
// MONGODB CONNECTION
// ============================================================

let mongoClient = null;
let db = null;

const connectMongo = async () => {
  if (db) return db;
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  db = mongoClient.db(MONGODB_DB_NAME);
  console.log('[Agent] Connected to MongoDB');
  return db;
};

const disconnectMongo = async () => {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    db = null;
  }
};

// ============================================================
// SESSION TRACKING (Bug #4)
// ============================================================

// Generate or retrieve session ID
const getOrCreateSessionId = async () => {
  const database = await connectMongo();
  const agents = database.collection('agents');
  const agent = await agents.findOne({ agentId: config.agentId });

  if (agent?.sessionId) {
    console.log('[Agent] Using existing session: ' + agent.sessionId.slice(0, 16) + '...');
    return agent.sessionId;
  }

  // Generate new session ID with timestamp for debugging
  const sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);

  await agents.updateOne(
    { agentId: config.agentId },
    { $set: { sessionId } }
  );

  console.log('[Agent] Created new session: ' + sessionId.slice(0, 16) + '...');
  return sessionId;
};

// Update token usage (Bug #4)
const updateTokenUsage = async (inputTokens, outputTokens) => {
  const database = await connectMongo();
  const agents = database.collection('agents');

  await agents.updateOne(
    { agentId: config.agentId },
    {
      $inc: {
        'tokenUsage.totalInputTokens': inputTokens,
        'tokenUsage.totalOutputTokens': outputTokens,
      },
      $set: {
        'tokenUsage.lastUpdated': new Date(),
      },
    }
  );

  console.log('[Agent] Token usage updated: +' + inputTokens + ' in / +' + outputTokens + ' out');
};

// ============================================================
// COORDINATION TOOLS
// ============================================================

const PREVIEW_LENGTH = 50;  // Bug #5: 50-char previews

const coordination = {
  // Send message to another agent
  sendMessage: async (toAgent, content, type = 'result') => {
    const database = await connectMongo();
    const messages = database.collection('messages');
    const messageId = crypto.randomUUID();
    const threadId = crypto.randomUUID();

    await messages.insertOne({
      messageId,
      fromAgent: config.agentId,
      toAgent,
      content,
      type,
      threadId,
      priority: 'normal',
      readAt: null,
      createdAt: new Date(),
    });

    console.log('[Agent] Sent message to ' + toAgent.slice(0, 8));
    return messageId;
  },

  // Check inbox for new messages (Bug #5: return 50-char previews, not full content)
  checkInbox: async () => {
    const database = await connectMongo();
    const messages = database.collection('messages');

    const unread = await messages
      .find({ toAgent: config.agentId, readAt: null })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    // Return lightweight previews only (Bug #5)
    return unread.map(msg => ({
      messageId: msg.messageId,
      fromAgent: msg.fromAgent,
      type: msg.type,
      priority: msg.priority,
      preview: msg.content.length > PREVIEW_LENGTH
        ? msg.content.slice(0, PREVIEW_LENGTH) + '...'
        : msg.content,
      createdAt: msg.createdAt,
    }));
  },

  // Read full message content (Bug #5: new tool)
  readMessage: async (messageId) => {
    const database = await connectMongo();
    const messages = database.collection('messages');

    const message = await messages.findOne({ messageId });

    if (!message) {
      return { error: 'Message ' + messageId + ' not found' };
    }

    // Mark as read
    await messages.updateOne(
      { messageId },
      { $set: { readAt: new Date() } }
    );

    console.log('[Agent] Read message: ' + messageId.slice(0, 8));

    return {
      messageId: message.messageId,
      fromAgent: message.fromAgent,
      content: message.content,
      type: message.type,
      threadId: message.threadId,
      createdAt: message.createdAt,
    };
  },

  // Create checkpoint
  checkpoint: async (summary, resumePointer, tokensUsed = 0) => {
    const database = await connectMongo();
    const checkpoints = database.collection('checkpoints');
    const checkpointId = crypto.randomUUID();

    await checkpoints.insertOne({
      checkpointId,
      agentId: config.agentId,
      summary,
      resumePointer,
      tokensUsed,
      createdAt: new Date(),
    });

    console.log('[Agent] Checkpoint created: ' + checkpointId.slice(0, 8));
    return checkpointId;
  },

  // Update agent status
  updateStatus: async (status, taskId = null) => {
    const database = await connectMongo();
    const agents = database.collection('agents');

    await agents.updateOne(
      { agentId: config.agentId },
      { $set: { status, taskId, lastHeartbeat: new Date() } }
    );

    console.log('[Agent] Status: ' + status);
  },

  // Complete a task
  completeTask: async (taskId, result) => {
    const database = await connectMongo();
    const tasks = database.collection('tasks');

    await tasks.updateOne(
      { taskId },
      { $set: { status: 'completed', result, updatedAt: new Date() } }
    );

    console.log('[Agent] Task completed: ' + taskId.slice(0, 8));
  },

  // ============================================================
  // DIRECTOR-ONLY COORDINATION (Bug #3)
  // ============================================================

  // Spawn a specialist agent (Director only)
  spawnSpecialist: async (specialization = 'general') => {
    if (config.agentType !== 'director') {
      throw new Error('Only directors can spawn specialists');
    }

    const database = await connectMongo();
    const agents = database.collection('agents');
    const specialistId = crypto.randomUUID();

    const now = new Date();
    await agents.insertOne({
      agentId: specialistId,
      type: 'specialist',
      specialization,
      status: 'idle',
      sandboxId: null,
      sandboxStatus: 'none',
      parentId: config.agentId,
      taskId: null,
      createdAt: now,
      lastHeartbeat: now,
    });

    console.log('[Agent] Spawned specialist: ' + specialistId.slice(0, 8) + ' (' + specialization + ')');
    return specialistId;
  },

  // Create a task
  createTask: async (title, description, parentTaskId = null) => {
    const database = await connectMongo();
    const tasks = database.collection('tasks');
    const taskId = crypto.randomUUID();

    const now = new Date();
    await tasks.insertOne({
      taskId,
      parentTaskId,
      assignedTo: null,
      title,
      description,
      status: 'pending',
      result: null,
      createdAt: now,
      updatedAt: now,
    });

    console.log('[Agent] Created task: ' + taskId.slice(0, 8) + ' - ' + title);
    return taskId;
  },

  // Assign a task to an agent
  assignTask: async (taskId, agentId) => {
    const database = await connectMongo();
    const tasks = database.collection('tasks');

    await tasks.updateOne(
      { taskId },
      { $set: { assignedTo: agentId, status: 'assigned', updatedAt: new Date() } }
    );

    console.log('[Agent] Assigned task ' + taskId.slice(0, 8) + ' to ' + agentId.slice(0, 8));
  },

  // Get task status
  getTaskStatus: async (taskId) => {
    const database = await connectMongo();
    const tasks = database.collection('tasks');

    const task = await tasks.findOne({ taskId });
    if (!task) {
      return { error: 'Task ' + taskId + ' not found' };
    }

    return {
      taskId: task.taskId,
      title: task.title,
      status: task.status,
      assignedTo: task.assignedTo,
      result: task.result,
    };
  },

  // List specialists under this director
  listSpecialists: async () => {
    if (config.agentType !== 'director') {
      return [];
    }

    const database = await connectMongo();
    const agents = database.collection('agents');

    const specialists = await agents
      .find({ parentId: config.agentId })
      .toArray();

    return specialists.map(s => ({
      agentId: s.agentId,
      type: s.type,
      specialization: s.specialization,
      status: s.status,
    }));
  },

  // Wait for specialists to complete (poll tasks)
  waitForSpecialists: async (specialistIds, timeoutMs = 60000) => {
    const database = await connectMongo();
    const tasks = database.collection('tasks');
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      // Get all tasks assigned to these specialists
      const specialistTasks = await tasks
        .find({ assignedTo: { $in: specialistIds } })
        .sort({ createdAt: -1 })
        .toArray();

      // Check if all have completed or failed
      const pendingTasks = specialistTasks.filter(
        t => t.status !== 'completed' && t.status !== 'failed'
      );

      if (pendingTasks.length === 0 && specialistTasks.length > 0) {
        console.log('[Agent] All specialist tasks completed');
        return specialistTasks;
      }

      console.log('[Agent] Waiting for ' + pendingTasks.length + ' tasks...');

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Timeout - return what we have
    const finalTasks = await tasks
      .find({ assignedTo: { $in: specialistIds } })
      .sort({ createdAt: -1 })
      .toArray();

    console.log('[Agent] Timeout reached, returning ' + finalTasks.length + ' tasks');
    return finalTasks;
  },

  // Aggregate results from completed tasks
  aggregateResults: (tasks) => {
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.result);

    if (completedTasks.length === 0) {
      return 'No completed tasks to aggregate.';
    }

    const sections = completedTasks.map(task => {
      return '## ' + task.title + '\\n\\n' + task.result;
    });

    return sections.join('\\n\\n---\\n\\n');
  },
};

// ============================================================
// CLAUDE SDK INTEGRATION
// ============================================================

const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const buildSystemPrompt = () => {
  // Director-specific system prompt with orchestration capabilities
  if (config.agentType === 'director') {
    return \`You are a DIRECTOR agent in the Squad Lite multi-agent system.

## Agent Identity
- Agent ID: \${config.agentId}
- Type: director
- Role: Orchestrate and coordinate specialist agents

## Your Capabilities
As a Director, you can:
1. **Decompose tasks** - Break down complex tasks into subtasks
2. **Spawn specialists** - Create specialist agents with roles: researcher, writer, analyst, general
3. **Coordinate work** - Assign tasks to specialists and monitor progress
4. **Aggregate results** - Combine outputs from multiple specialists

## Task Decomposition Guidelines
When you receive a task:
1. Analyze what subtasks are needed (aim for 2-3 subtasks)
2. Determine which specialist type is best for each subtask
3. Output a decomposition plan as JSON

## Output Format (REQUIRED)
When decomposing a task, output ONLY valid JSON in this format:
{
  "subtasks": [
    {
      "title": "Subtask title",
      "description": "Detailed description of what needs to be done",
      "specialization": "researcher|writer|analyst|general"
    }
  ]
}

## Instructions
- Decompose the given task into 2-3 actionable subtasks
- Each subtask should be completable by a single specialist
- Be specific in descriptions so specialists know exactly what to do
- Output ONLY the JSON, no additional text\`;
  }

  // Specialist system prompt
  return \`You are a SPECIALIST agent in the Squad Lite multi-agent system.

## Agent Identity
- Agent ID: \${config.agentId}
- Type: specialist
- Specialization: \${config.specialization || 'general'}
\${config.parentId ? '- Director: ' + config.parentId : ''}

## Instructions
Complete the assigned task thoroughly. Think step by step.
When you complete the task, output your final result clearly.

## Output Format
- Structure your response clearly
- Include all relevant details
- Be concise but comprehensive\`;
};

// ============================================================
// DIRECTOR ORCHESTRATION (Bug #3)
// ============================================================

const runDirectorOrchestration = async () => {
  console.log('[Director] Starting orchestration');
  console.log('[Director] Task: ' + config.task.slice(0, 100) + '...');

  // Step 1: Decompose task via Claude call
  console.log('[Director] Step 1: Decomposing task...');

  const decomposeResponse = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [
      { role: 'user', content: 'Decompose this task into subtasks:\\n\\n' + config.task }
    ],
  });

  // Track token usage (Bug #4)
  await updateTokenUsage(
    decomposeResponse.usage.input_tokens,
    decomposeResponse.usage.output_tokens
  );

  const decomposeContent = decomposeResponse.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  console.log('[Director] Decomposition result: ' + decomposeContent.slice(0, 200) + '...');

  // Parse subtasks from response
  let subtasks = [];
  try {
    // Try to extract JSON from the response
    const jsonMatch = decomposeContent.match(/\\{[\\s\\S]*\\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      subtasks = parsed.subtasks || [];
    }
  } catch (e) {
    console.log('[Director] Failed to parse subtasks, using default');
    subtasks = [
      { title: 'Complete task', description: config.task, specialization: 'general' }
    ];
  }

  if (subtasks.length === 0) {
    subtasks = [
      { title: 'Complete task', description: config.task, specialization: 'general' }
    ];
  }

  console.log('[Director] Decomposed into ' + subtasks.length + ' subtasks');

  // Checkpoint after decomposition
  await coordination.checkpoint(
    {
      goal: config.task.slice(0, 100),
      completed: ['Task decomposition'],
      pending: subtasks.map(s => s.title),
      decisions: ['Decomposed into ' + subtasks.length + ' subtasks'],
    },
    {
      nextAction: 'Spawn specialists',
      phase: 'spawning',
    },
    decomposeResponse.usage.input_tokens + decomposeResponse.usage.output_tokens
  );

  // Step 2: Spawn specialists and assign tasks
  console.log('[Director] Step 2: Spawning specialists...');

  const specialistIds = [];
  for (const subtask of subtasks) {
    // Spawn specialist
    const specialistId = await coordination.spawnSpecialist(subtask.specialization || 'general');
    specialistIds.push(specialistId);

    // Create and assign task
    const taskId = await coordination.createTask(subtask.title, subtask.description);
    await coordination.assignTask(taskId, specialistId);

    // Send task message to specialist
    await coordination.sendMessage(
      specialistId,
      'Task assigned: ' + subtask.title + '\\n\\nDescription: ' + subtask.description,
      'task'
    );
  }

  console.log('[Director] Spawned ' + specialistIds.length + ' specialists');

  // Checkpoint after spawning
  await coordination.checkpoint(
    {
      goal: config.task.slice(0, 100),
      completed: ['Task decomposition', 'Specialist spawning'],
      pending: ['Wait for specialists', 'Aggregate results'],
      decisions: ['Spawned ' + specialistIds.length + ' specialists'],
    },
    {
      nextAction: 'Wait for specialists',
      phase: 'waiting',
      currentContext: 'Specialist IDs: ' + specialistIds.map(id => id.slice(0, 8)).join(', '),
    },
    0
  );

  // Step 3: Wait for specialists to complete
  console.log('[Director] Step 3: Waiting for specialists...');

  const completedTasks = await coordination.waitForSpecialists(specialistIds, 120000); // 2 minute timeout

  console.log('[Director] Specialists completed: ' + completedTasks.length + ' tasks');

  // Step 4: Aggregate results
  console.log('[Director] Step 4: Aggregating results...');

  const aggregatedResult = coordination.aggregateResults(completedTasks);

  // Final summary via Claude
  const summaryResponse = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: 'You are a Director agent summarizing the work of your team.',
    messages: [
      {
        role: 'user',
        content: \`Original task: \${config.task}

Specialist results:
\${aggregatedResult}

Please provide a concise executive summary of the completed work.\`
      }
    ],
  });

  // Track token usage (Bug #4)
  await updateTokenUsage(
    summaryResponse.usage.input_tokens,
    summaryResponse.usage.output_tokens
  );

  const summary = summaryResponse.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Final output
  const finalOutput = \`## Executive Summary

\${summary}

---

## Detailed Results

\${aggregatedResult}\`;

  console.log('\\n=== DIRECTOR OUTPUT ===');
  console.log(finalOutput);
  console.log('=== END OUTPUT ===\\n');

  // Final checkpoint
  await coordination.checkpoint(
    {
      goal: config.task.slice(0, 100),
      completed: ['Task decomposition', 'Specialist spawning', 'Wait for specialists', 'Result aggregation'],
      pending: [],
      decisions: ['Completed orchestration with ' + specialistIds.length + ' specialists'],
    },
    {
      nextAction: 'Complete',
      phase: 'complete',
    },
    summaryResponse.usage.input_tokens + summaryResponse.usage.output_tokens
  );

  return finalOutput;
};

// ============================================================
// SPECIALIST EXECUTION
// ============================================================

const runSpecialist = async () => {
  console.log('[Specialist] Starting execution');
  console.log('[Specialist] Task: ' + config.task.slice(0, 100) + '...');

  // Call Claude
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: buildSystemPrompt(),
    messages: [
      { role: 'user', content: config.task }
    ],
  });

  // Track token usage (Bug #4)
  await updateTokenUsage(response.usage.input_tokens, response.usage.output_tokens);

  const content = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  console.log('[Specialist] Response length: ' + content.length + ' chars');
  console.log('[Specialist] Tokens: ' + response.usage.input_tokens + ' in / ' + response.usage.output_tokens + ' out');

  // Output the result (streamed to WebSocket)
  console.log('\\n=== SPECIALIST OUTPUT ===');
  console.log(content);
  console.log('=== END OUTPUT ===\\n');

  // Create checkpoint
  await coordination.checkpoint(
    {
      goal: config.task.slice(0, 100),
      completed: ['Task execution'],
      pending: [],
      decisions: [],
    },
    {
      nextAction: 'Complete',
      phase: 'complete',
    },
    response.usage.input_tokens + response.usage.output_tokens
  );

  // Report result back to parent
  if (config.parentId) {
    await coordination.sendMessage(config.parentId, content, 'result');
  }

  return content;
};

// ============================================================
// MAIN AGENT RUNNER
// ============================================================

const runAgent = async () => {
  console.log('[Agent] Starting: ' + config.agentId.slice(0, 8));
  console.log('[Agent] Type: ' + config.agentType);
  console.log('[Agent] Task: ' + config.task.slice(0, 100) + '...');

  // Get or create session ID (Bug #4)
  const sessionId = await getOrCreateSessionId();
  console.log('[Agent] Session: ' + sessionId.slice(0, 16) + '...');

  // Update status to working
  await coordination.updateStatus('working');

  try {
    let result;

    // Route to appropriate execution path (Bug #3)
    if (config.agentType === 'director') {
      result = await runDirectorOrchestration();
    } else {
      result = await runSpecialist();
    }

    // Update status to completed
    await coordination.updateStatus('completed');

    console.log('[Agent] Completed successfully');
    return result;

  } catch (error) {
    console.error('[Agent] Error:', error.message);
    await coordination.updateStatus('error');
    throw error;
  }
};

// ============================================================
// MAIN
// ============================================================

(async () => {
  try {
    const result = await runAgent();
    await disconnectMongo();
    process.exit(0);
  } catch (error) {
    console.error('[Agent] Fatal error:', error);
    await disconnectMongo();
    process.exit(1);
  }
})();
`

// ============================================================
// PACKAGE.JSON FOR SANDBOX
// ============================================================

/**
 * Minimal package.json for the E2B sandbox environment
 */
export const SANDBOX_PACKAGE_JSON = `{
  "name": "squad-lite-agent",
  "version": "1.0.0",
  "type": "module",
  "main": "agent-runner.js",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "mongodb": "^6.11.0"
  }
}`

// ============================================================
// SETUP SCRIPT
// ============================================================

/**
 * Script that sets up the sandbox environment
 */
export const SANDBOX_SETUP_SCRIPT = `
#!/bin/bash
set -e

# Create working directory
mkdir -p /home/user/squad-lite
cd /home/user/squad-lite

# Install dependencies
npm install @anthropic-ai/sdk mongodb --save

echo "[Setup] Sandbox ready"
`

// ============================================================
// BUNDLE TYPES
// ============================================================

export type AgentRunConfig = {
  agentId: string
  agentType: 'director' | 'specialist'
  specialization?: 'researcher' | 'writer' | 'analyst' | 'general'
  task: string
  parentId?: string
}

/**
 * Build the command to run an agent inside the sandbox
 * NOTE: Task is NOT passed as command-line argument to prevent command injection.
 *       Instead, task is passed via AGENT_TASK environment variable.
 */
export const buildAgentCommand = (cfg: AgentRunConfig): string => {
  // Only pass safe identifiers as command-line args
  // Task is passed via AGENT_TASK env var to prevent injection via $() or backticks
  const args = [
    `--agentId "${cfg.agentId}"`,
    `--agentType "${cfg.agentType}"`,
  ]

  if (cfg.specialization) {
    args.push(`--specialization "${cfg.specialization}"`)
  }

  if (cfg.parentId) {
    args.push(`--parentId "${cfg.parentId}"`)
  }

  return `node /home/user/squad-lite/agent-runner.js ${args.join(' ')}`
}

/**
 * Build environment variables for agent execution
 * Task is passed as env var to prevent command injection
 */
export const buildAgentEnvVars = (cfg: AgentRunConfig): Record<string, string> => {
  return {
    AGENT_TASK: cfg.task,
    AGENT_ID: cfg.agentId,
  }
}

/**
 * Files to deploy to sandbox
 */
export const SANDBOX_FILES = {
  '/home/user/squad-lite/agent-runner.js': AGENT_RUNNER_SCRIPT,
  '/home/user/squad-lite/package.json': SANDBOX_PACKAGE_JSON,
}
