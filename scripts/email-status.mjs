#!/usr/bin/env node
/**
 * Safe local email diagnostics — prints mode without leaking SMTP_PASS.
 * Usage: npm run email:status
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

const emailEnabledFlag = process.env.EMAIL_ENABLED === 'true'
const hasSmtpHost = Boolean(process.env.SMTP_HOST?.trim())
const emailConfigured = emailEnabledFlag && hasSmtpHost
const emailMode = emailConfigured ? 'live' : 'log'
const warnings = []
if (emailEnabledFlag && !hasSmtpHost) {
  warnings.push('EMAIL_ENABLED is true but SMTP_HOST is missing — staying in log mode')
}

console.log(JSON.stringify({
  emailMode,
  emailConfigured,
  EMAIL_ENABLED: process.env.EMAIL_ENABLED || '(unset)',
  hasSmtpHost,
  hasSmtpUser: Boolean(process.env.SMTP_USER?.trim()),
  hasSmtpFrom: Boolean(process.env.SMTP_FROM?.trim()),
  smtpPort: process.env.SMTP_PORT || '587',
  warnings,
  note: emailMode === 'live'
    ? 'Live SMTP — password reset and booking emails will send'
    : 'Safe log mode — emails are logged only; SMTP not required',
}, null, 2))
