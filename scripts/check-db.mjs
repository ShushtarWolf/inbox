#!/usr/bin/env node
/** Fail fast when DATABASE_URL is not PostgreSQL. */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadDotEnv()

const url = process.env.DATABASE_URL || ''

if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
  console.error('[check-db] DATABASE_URL must be a PostgreSQL connection string.')
  console.error('[check-db] Example: postgresql://inbox:inbox@localhost:5432/inbox')
  console.error('[check-db] Start Postgres: docker compose up -d')
  process.exit(1)
}

console.log('[check-db] ok')
