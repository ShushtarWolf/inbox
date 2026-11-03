#!/usr/bin/env node
/**
 * CI gate: block new production paths that hard-delete Payment rows or mutate wallet
 * amounts outside approved helpers (lightweight grep — not a full static analyzer).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SERVER = join(ROOT, 'server')

const ALLOWED_PAYMENT_DELETE = new Set([
  join(ROOT, 'server/utils/wipeCatalog.ts'),
])

const WALLET_AMOUNT_FORBIDDEN = [
  /\bwallet\.update\s*\(\s*\{[^}]*\bdata:\s*\{[^}]*\bbalance:\s*\{/s,
  /\bclubWallet\.update\s*\(\s*\{[^}]*\bdata:\s*\{[^}]*\bbalance:\s*\{/s,
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(p)
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

if (failed) {
  process.exit(1)
}
console.log('[check-money-safety] OK')
