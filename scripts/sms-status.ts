#!/usr/bin/env node
/**
 * Safe local SMS diagnostics — prints resolved provider mode without leaking secrets.
 * Usage: npm run sms:status
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getSmsStatusSnapshot } from '../shared/sms.ts'

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

const snapshot = getSmsStatusSnapshot()
console.log(JSON.stringify({
  smsPhase: snapshot.smsPhase,
  multiReady: snapshot.multiReady,
  multiReadyChecks: snapshot.multiReadyChecks,
  resolvedProvider: snapshot.resolvedProvider,
  SMS_PROVIDER: process.env.SMS_PROVIDER || '(unset → log)',
  SMS_ENABLED: process.env.SMS_ENABLED || '(unset)',
  hasKavenegarApiKey: snapshot.hasKavenegarApiKey,
  hasKavenegarTemplate: snapshot.hasKavenegarTemplate,
  hasKavenegarSender: snapshot.hasKavenegarSender,
  hasOtpBypassConfigured: snapshot.hasOtpBypassConfigured,
  warningCodes: snapshot.warningCodes,
  warnings: snapshot.warnings,
  nextActionCodes: snapshot.nextActionCodes,
  nextActions: snapshot.nextActions,
  noteCode: snapshot.noteCode,
  note: snapshot.note,
}, null, 2))
