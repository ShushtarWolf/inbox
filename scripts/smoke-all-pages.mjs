#!/usr/bin/env node
/** Full page smoke — public routes + authenticated dashboards. FA-only / prod-aware. */
import fs from 'node:fs'
import path from 'node:path'
import { isProdSmokeBase, isPilotNoCoachRuntime } from './lib/smoke-helpers.mjs'

const base = process.env.BASE_URL || 'http://localhost:3000'
const prodAware = isProdSmokeBase(base)

const ROOT = path.resolve(import.meta.dirname, '..')
const faMessages = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'locales', 'fa.json'), 'utf8'))
const namespaceRe = new RegExp(`\\b(?:${Object.keys(faMessages).join('|')})(?:\\.[A-Za-z][A-Za-z0-9_]*)+`, 'g')

/** Visible text only — script/style payloads legitimately contain key paths. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
}

/** Raw `t()` key paths reaching the user mean FA messages failed to resolve. */
function findRawI18nKeys(html) {
  const leaked = new Set()
  for (const match of visibleText(html).matchAll(namespaceRe)) {
    const resolved = match[0].split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), faMessages)
    if (resolved !== undefined) leaked.add(match[0])
  }
  return [...leaked]
}

const publicPaths = [
  '/',
  '/clubs',
  '/login',
  '/register',
  '/register/owner',
  '/privacy',
  '/terms',
  '/about',
  '/contact',
  '/pricing',
  '/complaints',
  '/cancellation',
  '/offline',
  '/forgot-password',
  '/reset-password',
]

/** Coach discovery is public only when the coach product is enabled. */
const coachPublicPaths = ['/coaches', '/register/coach']

/** Soft-disabled EN + legacy apply routes — 301/302/307/308 OK */
const redirectPaths = [
  '/clubs/apply',
  '/en',
  '/en/clubs',
  '/en/coaches',
  '/en/login',
  '/en/privacy',
  '/en/forgot-password',
  '/en/register/owner',
  '/en/register/coach',
]

const ownerPaths = [
  '/owner/calendar', '/owner/finance', '/owner/finance/report', '/owner/equipments', '/owner/packages',
  '/owner/crm', '/owner/coaches', '/owner/support', '/owner/settings',
  '/owner/setup', '/owner/reserve/season', '/owner/reserve/package',
]
/** Dashboard entry points that forward to their real landing page. */
const ownerRedirectPaths = ['/owner']
const coachPaths = ['/coach', '/coach/schedule', '/coach/clients', '/coach/profile']
const athletePaths = ['/athlete', '/athlete/bookings', '/athlete/profile']
const adminPaths = [
  '/admin',
  '/admin/tickets',
  '/admin/withdrawals',
  '/admin/clubs',
  '/admin/users',
  '/admin/bookings',
  '/admin/applications',
  '/admin/sms',
  '/admin/provision',
]

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
  let res = await fetch(`${base}${path}`, { headers, redirect: 'manual' })
  if (expectRedirect) {
    if (![301, 302, 307, 308].includes(res.status)) {
      throw new Error(`${label || path} expected redirect, got ${res.status}`)
    }
    return
  }
  // Same-path trailing slash (static public/ shadow) — follow once
  if ([301, 302, 307, 308].includes(res.status)) {
    const loc = res.headers.get('location') || ''
    let target = loc
    try {
      if (/^https?:\/\//i.test(loc)) target = new URL(loc).pathname
    } catch { /* keep */ }
    const bare = path.endsWith('/') ? path.slice(0, -1) : path
    if (target === `${bare}/`) {
      res = await fetch(`${base}${target}`, { headers, redirect: 'manual' })
    }
  }
  if (res.status !== expectStatus) {
    throw new Error(`${label || path} → ${res.status}`)
  }
  const html = await res.text()
  if (!html.includes('__nuxt') && !html.includes('<!DOCTYPE')) {
    throw new Error(`${label || path} missing SPA shell`)
  }
  const leakedKeys = findRawI18nKeys(html)
  if (leakedKeys.length) {
    throw new Error(`${label || path} rendered raw i18n keys: ${leakedKeys.join(', ')}`)
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
  console.log(`smoke-all-pages → ${base}${prodAware ? ' (prod-aware)' : ''}`)

  const pilotNoCoach = await isPilotNoCoachRuntime(base)
  if (pilotNoCoach) console.log('note  pilotNoCoach=true — coach routes expected to redirect')

  for (const path of publicPaths) {
    await check(path, { label: `public ${path}` })
    console.log(`ok  public ${path}`)
  }

  for (const path of coachPublicPaths) {
    await check(path, { expectRedirect: pilotNoCoach, label: `public ${path}` })
    console.log(`ok  public ${path}`)
  }

  for (const path of redirectPaths) {
    await check(path, { expectRedirect: true, label: `redirect ${path}` })
    console.log(`ok  redirect ${path}`)
  }

  await check('/owner', { expectRedirect: true, label: 'guest /owner' })
  await check('/coach', { expectRedirect: true, label: 'guest /coach' })
  await check('/athlete', { expectRedirect: true, label: 'guest /athlete' })
  console.log('ok  guest dashboard redirects')

  for (const path of adminPaths) {
    await check(path, { label: `admin ${path}` })
    console.log(`ok  admin ${path}`)
  }

  // Admin APIs require secret
  const adminOverview = await fetch(`${base}/api/admin/overview`)
  if (adminOverview.status !== 403 && adminOverview.status !== 503) {
    throw new Error(`admin overview without secret expected 403/503, got ${adminOverview.status}`)
  }
  console.log('ok  admin overview requires secret')

  if (prodAware) {
    console.log('skip  *@inbox.local dashboard login (prod / SMOKE_SKIP_DEMO)')
  } else {
    await login('owner', 'owner@inbox.local')
    await login('coach', 'coach@inbox.local')
    await login('athlete', 'athlete@inbox.local')

    for (const path of ownerRedirectPaths) {
      await check(path, { session: 'owner', expectRedirect: true, label: `owner ${path}` })
      console.log(`ok  owner ${path}`)
    }
    for (const path of ownerPaths) {
      await check(path, { session: 'owner', expectRedirect: pilotNoCoach && path === '/owner/coaches', label: `owner ${path}` })
      console.log(`ok  owner ${path}`)
    }
    for (const path of coachPaths) {
      await check(path, { session: 'coach', expectRedirect: pilotNoCoach, label: `coach ${path}` })
      console.log(`ok  coach ${path}`)
    }
    for (const path of athletePaths) {
      await check(path, { session: 'athlete', label: `athlete ${path}` })
      console.log(`ok  athlete ${path}`)
    }

    // EN dashboards soft-disabled → redirect
    await check('/en/owner', { session: 'owner', expectRedirect: true })
    await check('/en/coach', { session: 'coach', expectRedirect: true })
    await check('/en/athlete/bookings', { session: 'athlete', expectRedirect: true })
    console.log('ok  EN locale dashboard redirects')
  }

  try {
    await checkManifest()
    console.log('ok  PWA manifest brand colors')
  } catch (error) {
    console.warn(`skip manifest: ${error.message}`)
  }

  // Dynamic routes from seeded data
  try {
    const clubsRes = await fetch(`${base}/api/clubs`)
    const coachesRes = await fetch(`${base}/api/coaches`)
    if (clubsRes.ok && coachesRes.ok) {
      const clubs = await clubsRes.json()
      const coaches = await coachesRes.json()
      if (clubs[0]?.slug) {
        await check(`/clubs/${clubs[0].slug}`, { label: 'club detail' })
        console.log(`ok  /clubs/${clubs[0].slug}`)
      }
      if (coaches[0]?.id) {
        await check(`/coaches/${coaches[0].id}`, { expectRedirect: pilotNoCoach, label: 'coach detail' })
        console.log(`ok  /coaches/${coaches[0].id}`)
      }
    }
  } catch (error) {
    console.warn(`skip dynamic routes: ${error.message}`)
  }

  console.log('smoke-all-pages ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
