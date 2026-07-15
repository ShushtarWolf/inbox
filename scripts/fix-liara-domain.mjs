#!/usr/bin/env node
/**
 * Repair Liara custom-domain SSL for inboxs.ir.
 * Re-checks domain records and re-provisions certificates via api.iran.liara.ir.
 *
 * Usage: node scripts/fix-liara-domain.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const API_BASE = 'https://api.iran.liara.ir'
const DOMAINS = ['inboxs.ir', 'www.inboxs.ir']

function findToken() {
  const candidates = []
  const add = (p) => {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) candidates.push(p)
  }
  add(path.join(os.homedir(), '.liara-auth.json'))
  const liaraDir = path.join(os.homedir(), '.liara')
  if (fs.existsSync(liaraDir)) {
    for (const name of fs.readdirSync(liaraDir)) add(path.join(liaraDir, name))
  }

  function extract(data) {
    if (!data) return null
    for (const key of ['apiToken', 'api_token', 'token', 'accessToken']) {
      if (typeof data[key] === 'string' && data[key].length > 20) return data[key]
    }
    if (Array.isArray(data.accounts)) {
      const current = data.accounts.find((a) => a.current) || data.accounts[0]
      if (current) {
        for (const key of ['apiToken', 'api_token', 'token', 'accessToken']) {
          if (typeof current[key] === 'string' && current[key].length > 20) return current[key]
        }
      }
    }
    if (typeof data === 'object') {
      for (const value of Object.values(data)) {
        if (typeof value === 'object') {
          const nested = extract(value)
          if (nested) return nested
        }
      }
    }
    return null
  }

  for (const candidate of candidates) {
    try {
      const raw = fs.readFileSync(candidate, 'utf8')
      if (!raw.trim().startsWith('{')) continue
      const token = extract(JSON.parse(raw))
      if (token) return token
    } catch {
      // try next candidate
    }
  }
  throw new Error('Liara API token not found. Run: liara login')
}

async function api(token, method, urlPath, body) {
  const res = await fetch(`${API_BASE}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 500) }
  }
  return { status: res.status, json }
}

function summarize(domain) {
  return {
    name: domain.name,
    status: domain.status,
    cert: domain.certificatesStatus,
    cname: domain.CNameRecord,
    acme: domain.acmeRecord,
    behindCdn: domain.behindCdn,
    expiresAt: domain.expiresAt || domain.sslExpirationDate,
    target: domain.target || domain.cnameTarget || domain.CNameTarget || domain.aliasTarget,
    redirectTo: domain.redirectTo,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const token = findToken()

  console.log('[fix-liara-domain] Checking domains…')
  const list = await api(token, 'GET', '/v1/domains')
  if (list.status !== 200) {
    console.error('Failed to list domains:', list.status, list.json)
    process.exit(1)
  }

  const all = list.json.domains || []
  for (const name of DOMAINS) {
    const domain = all.find((d) => d.name === name)
    if (!domain) {
      console.warn(`[fix-liara-domain] Missing domain: ${name}`)
      continue
    }
    const check = await api(token, 'GET', `/v1/domains/${domain._id}/check`)
    const merged = { ...domain, ...(check.json.domain || {}) }
    console.log('[fix-liara-domain] Before:', JSON.stringify(summarize(merged), null, 2))
  }

  for (const name of DOMAINS) {
    console.log(`[fix-liara-domain] Re-provisioning SSL for ${name}…`)
    const result = await api(token, 'POST', '/v1/domains/provision-ssl-certs', { domain: name })
    console.log(`  → ${result.status}`, JSON.stringify(result.json).slice(0, 200))
  }

  console.log('[fix-liara-domain] Polling certificate status…')
  for (let i = 0; i < 12; i++) {
    await sleep(5000)
    const refreshed = await api(token, 'GET', '/v1/domains')
    const domains = (refreshed.json.domains || []).filter((d) => DOMAINS.includes(d.name))
    const summary = domains.map(summarize)
    console.log(`  poll ${i + 1}:`, JSON.stringify(summary))
    const pending = summary.some((d) => d.cert && !['ACTIVE', 'ERROR', 'FAILED'].includes(d.cert))
    if (!pending) break
  }

  console.log('[fix-liara-domain] Done. Test: curl -I https://inboxs.ir/')
}

main().catch((error) => {
  console.error('[fix-liara-domain] Error:', error.message)
  process.exit(1)
})
