#!/usr/bin/env node
/**
 * Safe local payments diagnostics — never prints SEP_TERMINAL_ID.
 * Usage: npm run payments:status
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPaymentsStatusSnapshot } from '../shared/payments.ts'

function loadEnvFile(filePath: string) {
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

const snapshot = getPaymentsStatusSnapshot()
console.log(JSON.stringify({
  ...snapshot,
  PAYMENTS_MODE: process.env.PAYMENTS_MODE || '(unset → pay_at_club)',
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || '(unset → sep when test|live)',
  NUXT_PUBLIC_SITE_URL: process.env.NUXT_PUBLIC_SITE_URL || '(unset)',
  verifyAdmin:
    'curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" https://inboxs.ir/api/admin/payments-status',
  cutoverRule:
    'Do NOT set PAYMENTS_MODE=live until SEP terminal verified. pay_at_club is OK MVP fallback.',
}, null, 2))
