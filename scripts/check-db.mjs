#!/usr/bin/env node
/** Fail fast when DATABASE_URL is missing or Postgres is unreachable. */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import net from 'node:net'
import { URL } from 'node:url'

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

function canConnect(host, port, timeoutMs = 1500) {
  return new Promise((resolveOk) => {
    const socket = net.connect({ host, port }, () => {
      socket.end()
      resolveOk(true)
    })
    socket.on('error', () => resolveOk(false))
    socket.setTimeout(timeoutMs, () => {
      socket.destroy()
      resolveOk(false)
    })
  })
}

loadDotEnv()

const url = process.env.DATABASE_URL || ''

if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
  console.error('[check-db] DATABASE_URL must be a PostgreSQL connection string.')
  console.error('[check-db] Example: postgresql://inbox:inbox@localhost:5432/inbox')
  console.error('[check-db] Start Postgres: docker compose up -d')
  process.exit(1)
}

let host = 'localhost'
let port = 5432
try {
  const parsed = new URL(url)
  host = parsed.hostname || host
  port = Number(parsed.port || 5432)
} catch {
  console.error('[check-db] DATABASE_URL is not a valid URL')
  process.exit(1)
}

const ok = await canConnect(host, port)
if (!ok) {
  console.error(`[check-db] cannot reach Postgres at ${host}:${port}`)
  console.error('[check-db] OTP login/register need a running database.')
  console.error('[check-db] Start local DB: docker compose up -d')
  console.error('[check-db] Or with Homebrew: brew services start postgresql@16')
  process.exit(1)
}

console.log(`[check-db] ok (${host}:${port})`)
