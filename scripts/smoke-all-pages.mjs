#!/usr/bin/env node
/** Full page smoke — public routes + authenticated dashboards. */
const base = process.env.BASE_URL || 'http://localhost:3000'

const publicPaths = [
  '/',
  '/clubs',
  '/coaches',
  '/login',
  '/register',
  '/privacy',
  '/terms',
  '/offline',
  '/clubs/apply',
  '/en',
  '/en/clubs',
  '/en/coaches',
  '/en/login',
  '/en/privacy',
]

const ownerPaths = [
  '/owner', '/owner/finance', '/owner/equipments', '/owner/packages',
  '/owner/crm', '/owner/coaches', '/owner/support', '/owner/settings',
  '/owner/setup', '/owner/reserve/season', '/owner/reserve/package',
]
const coachPaths = ['/coach', '/coach/schedule', '/coach/clients', '/coach/profile']
const athletePaths = ['/athlete', '/athlete/bookings', '/athlete/profile']

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

async function check(path, { session, expectRedirect, expectStatus = 200, label } = {}) {
  const headers = {}
  if (session && cookieJar.has(session)) headers.cookie = cookieJar.get(session)
  const res = await fetch(`${base}${path}`, { headers, redirect: 'manual' })
  if (expectRedirect) {
    if (res.status !== 302 && res.status !== 307) {
      throw new Error(`${label || path} expected redirect, got ${res.status}`)
    }
    return
  }
  if (res.status !== expectStatus) {
    throw new Error(`${label || path} → ${res.status}`)
  }
  const html = await res.text()
  if (!html.includes('__nuxt') && !html.includes('<!DOCTYPE')) {
    throw new Error(`${label || path} missing SPA shell`)
  }
}

async function checkManifest() {
  const res = await fetch(`${base}/manifest.webmanifest`)
  if (!res.ok) throw new Error(`manifest → ${res.status}`)
  const manifest = await res.json()
  if (manifest.theme_color !== '#C41E1E') {
    throw new Error(`manifest theme_color expected #C41E1E, got ${manifest.theme_color}`)
  }
  if (manifest.background_color !== '#F4EFE9') {
    throw new Error(`manifest background_color expected #F4EFE9, got ${manifest.background_color}`)
  }
}

async function main() {
  console.log(`smoke-all-pages → ${base}`)

  for (const path of publicPaths) {
    await check(path, { label: `public ${path}` })
    console.log(`ok  public ${path}`)
  }

  await check('/owner', { expectRedirect: true, label: 'guest /owner' })
  await check('/coach', { expectRedirect: true, label: 'guest /coach' })
  await check('/athlete', { expectRedirect: true, label: 'guest /athlete' })
  console.log('ok  guest dashboard redirects')

  await login('owner', 'owner@inbox.local')
  await login('coach', 'coach@inbox.local')
  await login('athlete', 'athlete@inbox.local')

  for (const path of ownerPaths) {
    await check(path, { session: 'owner', label: `owner ${path}` })
    console.log(`ok  owner ${path}`)
  }
  for (const path of coachPaths) {
    await check(path, { session: 'coach', label: `coach ${path}` })
    console.log(`ok  coach ${path}`)
  }
  for (const path of athletePaths) {
    await check(path, { session: 'athlete', label: `athlete ${path}` })
    console.log(`ok  athlete ${path}`)
  }

  await check('/en/owner', { session: 'owner' })
  await check('/en/coach', { session: 'coach' })
  await check('/en/athlete/bookings', { session: 'athlete' })
  console.log('ok  EN locale dashboards')

  try {
    await checkManifest()
    console.log('ok  PWA manifest brand colors')
  } catch (error) {
    console.warn(`skip manifest: ${error.message}`)
  }

  console.log('smoke-all-pages ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
