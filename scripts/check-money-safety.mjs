#!/usr/bin/env node
/**
 * CI gate: block new production paths that hard-delete Payment rows or mutate wallet
 * amounts outside approved helpers (lightweight grep — not a full static analyzer).
 * Also refuse wiring historical repair APPLY into deploy workflows.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SERVER = join(ROOT, 'server')
const WORKFLOWS = join(ROOT, '.github/workflows')

const ALLOWED_PAYMENT_DELETE = new Set([
  join(ROOT, 'server/utils/wipeCatalog.ts'),
])

const WALLET_AMOUNT_FORBIDDEN = [
  /\bwallet\.update\s*\(\s*\{[^}]*\bdata:\s*\{[^}]*\bbalance:\s*\{/s,
  /\bclubWallet\.update\s*\(\s*\{[^}]*\bdata:\s*\{[^}]*\bbalance:\s*\{/s,
]

function walk(dir, out = [], pred = (name) => /\.(ts|vue)$/.test(name)) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out, pred)
    else if (pred(name)) out.push(p)
  }
  return out
}

let failed = false

for (const file of walk(SERVER)) {
  const rel = file
  const src = readFileSync(file, 'utf8')
  if (/payment\.delete\s*\(/.test(src) && !ALLOWED_PAYMENT_DELETE.has(file)) {
    console.error(`[check-money-safety] Forbidden payment.delete in ${rel}`)
    failed = true
  }
  if (file.includes('/utils/wallet.ts') || file.includes('/utils/settlement.ts')) continue
  for (const re of WALLET_AMOUNT_FORBIDDEN) {
    if (re.test(src)) {
      console.error(`[check-money-safety] Direct wallet balance mutation in ${rel}`)
      failed = true
      break
    }
  }
}

// Deploy must never auto-APPLY historical cancel refunds / cash corrections.
for (const file of walk(WORKFLOWS, [], (name) => /\.ya?ml$/i.test(name))) {
  const base = file.split(/[/\\]/).pop() || ''
  if (!/^deploy/i.test(base) && base !== 'liara-iran-deploy.yml') continue
  const src = readFileSync(file, 'utf8')
  if (/repair-historical-cancel-refunds|money-repair-historical|money-correct-cash|APPLY\s*=\s*yes/i.test(src)
    && /apply\s*[:=]\s*['"]?true|apply=1|APPLY=yes/i.test(src)) {
    console.error(`[check-money-safety] Deploy workflow must not APPLY money repairs: ${base}`)
    failed = true
  }
  if (/repair-historical-cancel-refunds|money-repair-historical/i.test(src)) {
    console.error(`[check-money-safety] Deploy workflow must not invoke historical refund repair: ${base}`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}
console.log('[check-money-safety] OK')
