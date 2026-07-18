/** Shared helpers for smoke / integration scripts. */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Load `.env` into process.env without overwriting existing keys. */
export function loadDotEnv(filePath = resolve(process.cwd(), '.env')) {
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
    if (!(key in process.env)) process.env[key] = value
  }
}

export function createCookieJar() {
  return new Map()
}

function mergeSetCookies(jar, session, setCookies) {
  if (!jar || !session || !setCookies?.length) return
  const merged = new Map()
  const previous = jar.get(session)
  if (previous) {
    for (const item of previous.split('; ')) {
      const [key, ...rest] = item.split('=')
      if (key) merged.set(key, rest.join('='))
    }
  }
  for (const entry of setCookies) {
    const [pair] = entry.split(';')
    const [key, ...rest] = pair.split('=')
    if (key) merged.set(key, rest.join('='))
  }
  jar.set(session, [...merged.entries()].map(([key, value]) => `${key}=${value}`).join('; '))
}

export async function login(base, jar, session, email, password = 'demo1234') {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login ${email} → ${res.status}`)
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  mergeSetCookies(jar, session, setCookies)
  return res.json()
}

export async function apiFetch(base, path, { jar, session, method = 'GET', body, headers = {}, expectStatus } = {}) {
  const reqHeaders = new Headers(headers)
  if (body !== undefined && !reqHeaders.has('content-type')) {
    reqHeaders.set('content-type', 'application/json')
  }
  if (session && jar?.has(session)) {
    reqHeaders.set('cookie', jar.get(session))
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  if (session && jar) {
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
    mergeSetCookies(jar, session, setCookies)
  }
  if (expectStatus !== undefined && res.status !== expectStatus) {
    throw new Error(`${path} expected ${expectStatus}, got ${res.status}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return { res, data: await res.json() }
  }
  return { res, data: await res.text() }
}

export async function fetchPage(base, path, { jar, session, expectStatus = 200, expectRedirect } = {}) {
  const headers = {}
  if (session && jar?.has(session)) headers.cookie = jar.get(session)
  const res = await fetch(`${base}${path}`, { headers, redirect: 'manual' })
  if (expectRedirect) {
    const ok = [301, 302, 307, 308].includes(res.status)
    if (!ok) {
      throw new Error(`${path} expected redirect, got ${res.status}`)
    }
    return { res, html: '' }
  }
  if (res.status !== expectStatus) {
    throw new Error(`${path} → ${res.status}`)
  }
  const html = await res.text()
  return { res, html }
}

/** True when BASE_URL points at production (or smoke is asked to skip demo logins). */
export function isProdSmokeBase(base = process.env.BASE_URL || '') {
  if (process.env.SMOKE_SKIP_DEMO === '1') return true
  try {
    const host = new URL(base).hostname
    return host === 'inboxs.ir' || host.endsWith('.liara.run')
  } catch {
    return false
  }
}

export function assertSpaShell(html, label) {
  if (!html.includes('__nuxt') && !html.includes('<!DOCTYPE')) {
    throw new Error(`${label} missing SPA shell`)
  }
}

export function extractMeta(html, name) {
  const match = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'))
  return match?.[1] || null
}

export function extractHtmlLang(html) {
  const match = html.match(/<html[^>]+lang=["']([^"']+)["']/i)
  return match?.[1] || null
}

export async function timedFetch(url, options = {}) {
  const start = performance.now()
  const res = await fetch(url, options)
  const ms = performance.now() - start
  return { res, ms }
}
