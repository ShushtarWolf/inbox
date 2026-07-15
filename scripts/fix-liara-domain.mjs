#!/usr/bin/env node
/**
 * Repair Liara custom-domain edge for inboxs.ir.
 *
 * The public CF error "400 The plain HTTP request was sent to HTTPS port"
 * happens when Liara's edge speaks TLS on port 80. This script re-checks
 * domains, re-provisions SSL, and attempts edge re-bind toggles.
 *
 * Auth (first match wins):
 *   1. LIARA_API_TOKEN / LIARA_TOKEN env
 *   2. ~/.liara-auth.json (or ~/.liara/*) from `liara login`
 *
 * Usage:
 *   LIARA_API_TOKEN=... node scripts/fix-liara-domain.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const API_BASE = process.env.LIARA_API_BASE || 'https://api.iran.liara.ir'
const DOMAINS = (process.env.LIARA_DOMAINS || 'inboxs.ir,www.inboxs.ir')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function findToken() {
  if (process.env.LIARA_API_TOKEN?.trim()) return process.env.LIARA_API_TOKEN.trim()
  if (process.env.LIARA_TOKEN?.trim()) return process.env.LIARA_TOKEN.trim()

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
      // try next
    }
  }
  throw new Error(
    'No Liara API token. Set LIARA_API_TOKEN, or run: npx liara login\n' +
      'Create token: https://console.liara.ir/account/api-keys',
  )
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
    id: domain._id,
    name: domain.name,
    status: domain.status,
    cert: domain.certificatesStatus,
    cname: domain.CNameRecord,
    acme: domain.acmeRecord,
    behindCdn: domain.behindCdn,
    forceHttps: domain.forceHttps ?? domain.https ?? domain.redirectHttps,
    expiresAt: domain.expiresAt || domain.sslExpirationDate,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function probePublic(name) {
  const results = {}
  for (const [label, url] of [
    ['http', `http://${name}/`],
    ['https', `https://${name}/`],
  ]) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(12000),
      })
      const text = await res.text()
      results[label] = {
        status: res.status,
        location: res.headers.get('location'),
        server: res.headers.get('server'),
        snippet: text.slice(0, 120).replace(/\s+/g, ' '),
      }
    } catch (error) {
      results[label] = { error: error.cause?.code || error.message }
    }
  }
  return results
}

async function main() {
  const token = findToken()
  console.log(`[fix-liara-domain] API ${API_BASE}`)

  const list = await api(token, 'GET', '/v1/domains')
  if (list.status !== 200) {
    console.error('Failed to list domains:', list.status, list.json)
    process.exit(1)
  }

  const all = list.json.domains || []
  const targets = []
  for (const name of DOMAINS) {
    const domain = all.find((d) => d.name === name)
    if (!domain) {
      console.warn(`[fix-liara-domain] Missing domain: ${name}`)
      continue
    }
    const check = await api(token, 'GET', `/v1/domains/${domain._id}/check`)
    const merged = { ...domain, ...(check.json.domain || {}) }
    console.log('[before]', JSON.stringify(summarize(merged), null, 2))
    targets.push(merged)
  }

  const recreate = process.env.LIARA_RECREATE_DOMAIN === 'true'

  for (const domain of targets) {
    let id = domain._id
    const name = domain.name
    const projectId = domain.project?.project_id || domain.project?.projectId || 'inbox'
    console.log(`\n[fix-liara-domain] Repairing ${name}…`)

    if (recreate) {
      // Re-binding the domain fixes Liara edge when port 80 speaks TLS
      // (Cloudflare 400: "plain HTTP request was sent to HTTPS port").
      console.log(`  Recreating domain binding for ${name} (LIARA_RECREATE_DOMAIN=true)…`)
      const del = await api(token, 'DELETE', `/v1/domains/${id}`)
      console.log('  DELETE', del.status)
      await sleep(2000)
      const add = await api(token, 'POST', '/v1/domains', { name, project: projectId })
      console.log('  ADD', add.status, JSON.stringify(add.json).slice(0, 200))
      id = add.json.domain?._id || id
      await sleep(1500)
    }

    // Re-provision TLS certificate
    const ssl = await api(token, 'POST', '/v1/domains/provision-ssl-certs', { domain: name })
    console.log('  provision-ssl', ssl.status, JSON.stringify(ssl.json).slice(0, 200))

    // Try common force-https / CDN toggles (ignore 404s)
    for (const [method, pathSuffix, body] of [
      ['POST', `/v1/domains/${id}/force-https`, { enabled: true }],
      ['POST', `/v1/domains/${id}/enable-https`, {}],
      ['PATCH', `/v1/domains/${id}`, { forceHttps: true }],
      ['PATCH', `/v1/domains/${id}`, { behindCdn: false }],
      ['POST', `/v1/domains/${id}/check`, {}],
    ]) {
      const r = await api(token, method, pathSuffix, body)
      if (r.status !== 404) {
        console.log(`  ${method} ${pathSuffix}`, r.status, JSON.stringify(r.json).slice(0, 160))
      }
    }
  }

  // Restart app so reverse-proxy picks up cert/domain rebind
  const restart = await api(token, 'POST', '/v1/projects/inbox/actions/restart', {})
  console.log('\n[fix-liara-domain] restart inbox', restart.status)

  console.log('\n[fix-liara-domain] Polling cert status…')
  for (let i = 0; i < 10; i++) {
    await sleep(4000)
    const refreshed = await api(token, 'GET', '/v1/domains')
    const domains = (refreshed.json.domains || []).filter((d) => DOMAINS.includes(d.name))
    console.log(`  poll ${i + 1}:`, JSON.stringify(domains.map(summarize)))
    const pending = domains.some((d) => d.certificatesStatus && !['ACTIVE', 'ERROR', 'FAILED'].includes(d.certificatesStatus))
    if (!pending) break
  }

  console.log('\n[fix-liara-domain] Public probes (may fail outside Iran):')
  for (const name of DOMAINS) {
    console.log(name, JSON.stringify(await probePublic(name), null, 2))
  }

  console.log(`
Next if HTTP still returns Cloudflare 400:
  1. Prefer https://${DOMAINS[0]} (not http)
  2. For VPN / abroad: Cloudflare Tunnel — docs/VPN_ACCESS.md
     Set CLOUDFLARE_TUNNEL_TOKEN on Liara and move NS to Cloudflare
`)
}

main().catch((error) => {
  console.error('[fix-liara-domain]', error.message)
  process.exit(1)
})
