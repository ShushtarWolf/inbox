#!/usr/bin/env node
/** Dashboard route smoke — run with server up: BASE_URL=http://localhost:3000 node scripts/smoke-dashboard.mjs */
import { isProdSmokeBase } from './lib/smoke-helpers.mjs'

const base = process.env.BASE_URL || 'http://localhost:3000'
const prodAware = isProdSmokeBase(base)
const cookieJar = new Map()

async function login(session, email) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234' }),
  })
  if (!res.ok) throw new Error(`login ${email} → ${res.status}`)
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  if (setCookies.length) {
    cookieJar.set(session, setCookies.map((entry) => entry.split(';')[0]).join('; '))
  }
}

async function checkHtml(path, session, { allowRedirect, expectRedirect } = {}) {
  const headers = {}
  if (cookieJar.has(session)) headers.cookie = cookieJar.get(session)
  const res = await fetch(`${base}${path}`, { headers, redirect: 'manual' })
  if (expectRedirect) {
    if (![301, 302, 307, 308].includes(res.status)) {
      throw new Error(`${path} expected redirect, got ${res.status}`)
    }
    return
  }
  if (allowRedirect && [301, 302, 307, 308].includes(res.status)) {
    const location = res.headers.get('location') || ''
    if (!location.includes('/login')) {
      throw new Error(`${path} unexpected redirect → ${location}`)
    }
    return
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
}

async function main() {
  console.log(`smoke-dashboard → ${base}${prodAware ? ' (prod-aware)' : ''}`)

  await checkHtml('/owner', 'guest', { allowRedirect: true })
  await checkHtml('/coach', 'guest', { allowRedirect: true })
  await checkHtml('/athlete', 'guest', { allowRedirect: true })

  if (prodAware) {
    console.log('skip  *@inbox.local dashboard login (prod / SMOKE_SKIP_DEMO)')
    console.log('dashboard smoke ok')
    return
  }

  await login('owner', 'owner@inbox.local')
  await login('coach', 'coach@inbox.local')
  await login('athlete', 'athlete@inbox.local')

  const ownerPaths = ['/owner', '/owner/finance', '/owner/equipments', '/owner/packages', '/owner/crm', '/owner/coaches', '/owner/support', '/owner/settings']
  const coachPaths = ['/coach', '/coach/schedule', '/coach/clients', '/coach/profile']
  const athletePaths = ['/athlete', '/athlete/bookings', '/athlete/profile']

  for (const path of ownerPaths) await checkHtml(path, 'owner')
  for (const path of coachPaths) await checkHtml(path, 'coach')
  for (const path of athletePaths) await checkHtml(path, 'athlete')

  await checkHtml('/en/owner', 'owner', { expectRedirect: true })
  await checkHtml('/en/coach', 'coach', { expectRedirect: true })
  await checkHtml('/en/athlete/bookings', 'athlete', { expectRedirect: true })

  console.log('dashboard smoke ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
