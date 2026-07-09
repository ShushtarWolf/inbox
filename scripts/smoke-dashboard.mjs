#!/usr/bin/env node
/** Dashboard route smoke — run with server up: BASE_URL=http://localhost:3000 node scripts/smoke-dashboard.mjs */
const base = process.env.BASE_URL || 'http://localhost:3000'
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

async function checkHtml(path, session, { allowRedirect } = {}) {
  const headers = {}
  if (cookieJar.has(session)) headers.cookie = cookieJar.get(session)
  const res = await fetch(`${base}${path}`, { headers, redirect: 'manual' })
  if (allowRedirect && (res.status === 302 || res.status === 307)) {
    const location = res.headers.get('location') || ''
    if (!location.includes('/login')) {
      throw new Error(`${path} unexpected redirect → ${location}`)
    }
    return
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
}

async function main() {
  await checkHtml('/owner', 'guest', { allowRedirect: true })
  await checkHtml('/coach', 'guest', { allowRedirect: true })
  await checkHtml('/athlete', 'guest', { allowRedirect: true })

  await login('owner', 'owner@inbox.local')
  await login('coach', 'coach@inbox.local')
  await login('athlete', 'athlete@inbox.local')

  const ownerPaths = ['/owner', '/owner/finance', '/owner/equipments', '/owner/packages', '/owner/crm', '/owner/coaches', '/owner/support', '/owner/settings']
  const coachPaths = ['/coach', '/coach/schedule', '/coach/clients', '/coach/profile']
  const athletePaths = ['/athlete', '/athlete/bookings', '/athlete/profile']

  for (const path of ownerPaths) await checkHtml(path, 'owner')
  for (const path of coachPaths) await checkHtml(path, 'coach')
  for (const path of athletePaths) await checkHtml(path, 'athlete')

  await checkHtml('/en/owner', 'owner')
  await checkHtml('/en/coach', 'coach')
  await checkHtml('/en/athlete/bookings', 'athlete')

  console.log('dashboard smoke ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
