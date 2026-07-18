#!/usr/bin/env node
/**
 * Safe local Sentry diagnostics — never prints the DSN value.
 * Usage: npm run sentry:status
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
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
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env'))

const dsn = process.env.SENTRY_DSN?.trim() || ''
const sentryEnabled = Boolean(dsn)
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
const release = process.env.GIT_COMMIT_SHA || process.env.GITHUB_SHA || null

console.log(JSON.stringify({
  sentryEnabled,
  hasDsn: sentryEnabled,
  environment,
  release,
  note: sentryEnabled
    ? 'DSN is set in env — restart `npm run dev` after changing it; verify with POST /api/admin/sentry-test (x-admin-secret)'
    : 'DSN unset — plugins no-op; app works without Sentry',
  verifyServer: 'curl -X POST -H "x-admin-secret: $ADMIN_PROVISION_SECRET" http://localhost:3000/api/admin/sentry-test',
  verifyClient: 'With DSN set: open site → DevTools console → useNuxtApp().$sentryCaptureTest()',
}, null, 2))
