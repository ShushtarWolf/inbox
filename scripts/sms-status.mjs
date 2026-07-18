#!/usr/bin/env node
/**
 * Safe local SMS diagnostics — prints resolved provider mode without leaking secrets.
 * Usage: npm run sms:status
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

const provider = (process.env.SMS_PROVIDER || '').toLowerCase()
const wantsLive = provider === 'live' || provider === 'kavenegar'
const hasKey = Boolean(process.env.KAVENEGAR_API_KEY?.trim())
const enabled = process.env.SMS_ENABLED === 'true'
const resolved = wantsLive && enabled && hasKey ? 'live' : 'log'

console.log(JSON.stringify({
  resolvedProvider: resolved,
  SMS_PROVIDER: process.env.SMS_PROVIDER || '(unset → log)',
  SMS_ENABLED: process.env.SMS_ENABLED || '(unset)',
  hasKavenegarApiKey: hasKey,
  hasKavenegarTemplate: Boolean(process.env.KAVENEGAR_TEMPLATE?.trim()),
  hasKavenegarSender: Boolean(process.env.KAVENEGAR_SENDER?.trim()),
  note: resolved === 'live'
    ? 'Live Kavenegar — OTP will not return debugCode; real SMS will send'
    : 'Safe log mode — OTP returns debugCode; no gateway calls',
}, null, 2))
