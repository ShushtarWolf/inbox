#!/usr/bin/env node
/**
 * Replace local `inbox` Postgres with a Liara dump so localhost matches production data.
 *
 * Usage:
 *   node scripts/sync-local-db-from-prod-backup.mjs backups/inbox-db-YYYYMMDD-HHMMSS.dump
 *
 * Dump must be the Liara tar.gz (contains postgres.dump). Requires local
 * DATABASE_URL pointing at localhost and a Postgres role that can CREATE DATABASE
 * (Postgres.app OS user), plus app role inbox/inbox.
 */
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dumpPath = process.argv[2]
if (!dumpPath || !existsSync(dumpPath)) {
  console.error('Usage: node scripts/sync-local-db-from-prod-backup.mjs <liara-backup.tar.gz>')
  process.exit(1)
}

const pgBin = [
  '/Applications/Postgres.app/Contents/Versions/latest/bin',
  '/opt/homebrew/bin',
  '/usr/local/bin',
  process.env.PATH || '',
].join(':')

function run(cmd, opts = {}) {
  console.log('>', cmd)
  return execSync(cmd, { stdio: 'inherit', env: { ...process.env, PATH: pgBin }, ...opts })
}

const extractDir = join(tmpdir(), `inbox-prod-restore-${Date.now()}`)
mkdirSync(extractDir, { recursive: true })
run(`tar -xzf "${dumpPath}" -C "${extractDir}"`)
const postgresDump = join(extractDir, 'postgres.dump')
if (!existsSync(postgresDump)) {
  console.error('Expected postgres.dump inside the archive')
  process.exit(1)
}

const appUrl = process.env.DATABASE_URL || 'postgresql://inbox:inbox@localhost:5432/inbox'
if (!/localhost|127\.0\.0\.1/.test(appUrl)) {
  console.error('Refusing to run: DATABASE_URL is not localhost')
  process.exit(1)
}

mkdirSync('backups', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const safety = `backups/inbox-local-pre-sync-${stamp}.dump`
try {
  run(`pg_dump "${appUrl}" -Fc -f "${safety}"`)
  console.log('Safety dump:', safety)
} catch {
  console.warn('No existing local inbox DB to dump (continuing)')
}

run(`psql -h localhost -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'inbox' AND pid <> pg_backend_pid();"`)
run(`psql -h localhost -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS inbox;"`)
run(`psql -h localhost -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE inbox OWNER inbox;"`)
run(`pg_restore --no-owner --no-acl --dbname="${appUrl}" "${postgresDump}"`)

console.log('Restored. Verify with: curl -s http://localhost:3000/api/clubs | jq')
