import { z } from 'zod'
import { config as dotenvConfig } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dns from 'dns'

// Use Google DNS to resolve MongoDB Atlas hostnames
// (workaround for networks with internal DNS that can't resolve Atlas)
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1'])

// Get directory of this file for robust .env path resolution
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env file with explicit path (works from any working directory)
dotenvConfig({ path: resolve(__dirname, '..', '.env') })

// ============================================================
// ENVIRONMENT SCHEMA (Zod validation)
// ============================================================

const envSchema = z.object({
  // MongoDB Atlas
  MONGODB_URI: z.string().url().startsWith('mongodb'),
  MONGODB_DB_NAME: z.string().default('squad-lite'),

  // Anthropic API
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),

  // E2B Sandbox
  E2B_API_KEY: z.string().min(1),

  // Server config
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

// ============================================================
// VALIDATE AND EXPORT CONFIG
// ============================================================

const parseResult = envSchema.safeParse(process.env)

if (!parseResult.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parseResult.error.format())
  process.exit(1)
}

export const config = parseResult.data

// Type export for use elsewhere
export type Config = z.infer<typeof envSchema>

// ============================================================
// CONVENIENCE EXPORTS
// ============================================================

export const isDev = config.NODE_ENV === 'development'
export const isProd = config.NODE_ENV === 'production'
export const isTest = config.NODE_ENV === 'test'
