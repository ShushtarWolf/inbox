#!/usr/bin/env node
/** QA matrix: 3 roles × FA/EN route checks on production or local server. */
const base = process.env.BASE_URL || 'https://inboxs.ir'

function isNavItemActive(path, to, items) {
  const hasChildNav = items.some((item) => item.to !== to && item.to.startsWith(`${to}/`))
  if (hasChildNav) return path === to
  return path === to || path.startsWith(`${to}/`)
}

function assertNavActive() {
  const ownerNav = [
    { to: '/owner' },
    { to: '/owner/finance' },
    { to: '/owner/crm' },
  ]
  const athleteNav = [
    { to: '/athlete' },
    { to: '/athlete/bookings' },
    { to: '/athlete/profile' },
  ]
  const checks = [
    [!isNavItemActive('/owner/finance', '/owner', ownerNav), 'owner root not active on finance'],
    [isNavItemActive('/owner/finance', '/owner/finance', ownerNav), 'finance active on finance'],
    [isNavItemActive('/owner', '/owner', ownerNav), 'calendar active on root'],
    [!isNavItemActive('/athlete/bookings/abc', '/athlete', athleteNav), 'athlete overview not active on booking detail'],
    [isNavItemActive('/athlete/bookings/abc', '/athlete/bookings', athleteNav), 'bookings active on detail'],
  ]
  for (const [ok, label] of checks) {
    if (!ok) throw new Error(`nav active: ${label}`)
    console.log(`ok  nav ${label}`)
  }
}

const accounts = {
  owner: 'owner@inbox.local',
  coach: 'coach@inbox.local',
  athlete: 'athlete@inbox.local',
}
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

async function check(path, session, { expectRedirect, expectStatus = 200 } = {}) {
  const headers = {}
  if (cookieJar.has(session)) headers.cookie = cookieJar.get(session)
  const res = await fetch(`${base}${path}`, { headers, redirect: 'manual' })
  if (expectRedirect) {
    if (res.status !== 302 && res.status !== 307) throw new Error(`${path} expected redirect, got ${res.status}`)
    return
  }
  if (res.status !== expectStatus) throw new Error(`${path} → ${res.status}`)
  const html = await res.text()
  if (html.includes('__nuxt') === false && !html.includes('<!DOCTYPE')) {
    throw new Error(`${path} missing SPA shell`)
  }
}

const matrix = [
  { role: 'owner', locale: 'fa', paths: ['/owner', '/owner/finance', '/owner/crm'] },
  { role: 'owner', locale: 'en', paths: ['/en/owner', '/en/owner/finance'] },
  { role: 'coach', locale: 'fa', paths: ['/coach', '/coach/schedule', '/coach/clients'] },
  { role: 'coach', locale: 'en', paths: ['/en/coach', '/en/coach/schedule'] },
  { role: 'athlete', locale: 'fa', paths: ['/athlete', '/athlete/bookings', '/athlete/profile'] },
  { role: 'athlete', locale: 'en', paths: ['/en/athlete', '/en/athlete/bookings'] },
]

async function main() {
  assertNavActive()
  const failures = []
  for (const [session, email] of Object.entries(accounts)) {
    await login(session, email)
  }

  for (const row of matrix) {
    for (const path of row.paths) {
      try {
        await check(path, row.role)
        console.log(`ok  ${row.role} ${row.locale} ${path}`)
      } catch (error) {
        failures.push({ ...row, path, error: error.message })
        console.error(`FAIL ${row.role} ${row.locale} ${path}: ${error.message}`)
      }
    }
  }

  // Cross-role: athlete cannot access owner
  try {
    await check('/owner/finance', 'athlete', { expectRedirect: true })
    console.log('ok  athlete blocked from /owner/finance')
  } catch (error) {
    failures.push({ role: 'athlete', path: '/owner/finance', error: error.message })
  }

  // Guest redirect
  try {
    await check('/owner', 'guest', { expectRedirect: true })
    console.log('ok  guest redirected from /owner')
  } catch (error) {
    failures.push({ role: 'guest', path: '/owner', error: error.message })
  }

  if (failures.length) {
    console.error(`\n${failures.length} failure(s)`)
    process.exit(1)
  }
  console.log('\nqa matrix ok (12 route checks + 2 auth checks)')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
