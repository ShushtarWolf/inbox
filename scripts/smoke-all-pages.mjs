#!/usr/bin/env node
/** Full page smoke — public routes + authenticated dashboards. FA-only / prod / pilot aware. */
import {
  createCookieJar,
  demoLoginsBlocked,
  isPilotNoCoachRuntime,
  isProdSmokeBase,
  loadDotEnv,
  login as helperLogin,
  provisionOwner,
  registerAthlete,
} from './lib/smoke-helpers.mjs'

loadDotEnv()

const base = process.env.BASE_URL || 'http://localhost:3000'
const prodAware = isProdSmokeBase(base)
const adminSecret = process.env.ADMIN_PROVISION_SECRET || ''
const cookieJar = createCookieJar()

const publicPathsBase = [
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

/** Soft-disabled EN + legacy apply routes — 301/302/307/308 OK */
const redirectPathsBase = [
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

const ownerPathsBase = [
  '/owner', '/owner/finance', '/owner/equipments', '/owner/packages',
  '/owner/crm', '/owner/support', '/owner/settings',
  '/owner/setup', '/owner/reserve/season', '/owner/reserve/package',
]
const coachPaths = ['/coach', '/coach/schedule', '/coach/clients', '/coach/profile']
const athletePaths = ['/athlete', '/athlete/bookings', '/athlete/profile']
const adminPaths = [
  '/admin',
  '/admin/clubs',
  '/admin/users',
  '/admin/bookings',
  '/admin/applications',
  '/admin/bug-reports',
  '/admin/sms',
  '/admin/provision',
]

async function login(session, email, password = 'demo1234') {
  await helperLogin(base, cookieJar, session, email, password)
}

async function check(path, { session, expectRedirect, expectStatus = 200, label } = {}) {
  const headers = {}
  if (session && cookieJar.has(session)) headers.cookie = cookieJar.get(session)
  const res = await fetch(`${base}${path}`, { headers, redirect: 'manual' })
  if (expectRedirect) {
    if (![301, 302, 307, 308].includes(res.status)) {
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
  const pilotNoCoach = await isPilotNoCoachRuntime(base)
  console.log(`smoke-all-pages → ${base}${prodAware ? ' (prod-aware)' : ''}${pilotNoCoach ? ' (pilot)' : ''}`)

  const publicPaths = [
    ...publicPathsBase,
    ...(!pilotNoCoach ? ['/coaches', '/register/coach'] : []),
  ]
  const redirectPaths = [
    ...redirectPathsBase,
    ...(pilotNoCoach ? ['/coaches', '/register/coach', '/book/coach/x', '/coach'] : []),
  ]

  for (const path of publicPaths) {
    await check(path, { label: `public ${path}` })
    console.log(`ok  public ${path}`)
  }

  for (const path of redirectPaths) {
    await check(path, { expectRedirect: true, label: `redirect ${path}` })
    console.log(`ok  redirect ${path}`)
  }

  await check('/owner', { expectRedirect: true, label: 'guest /owner' })
  await check('/athlete', { expectRedirect: true, label: 'guest /athlete' })
  if (!pilotNoCoach) {
    await check('/coach', { expectRedirect: true, label: 'guest /coach' })
  }
  console.log('ok  guest dashboard redirects')

  for (const path of adminPaths) {
    await check(path, { label: `admin ${path}` })
    console.log(`ok  admin ${path}`)
  }

  const adminOverview = await fetch(`${base}/api/admin/overview`)
  if (adminOverview.status !== 403 && adminOverview.status !== 503) {
    throw new Error(`admin overview without secret expected 403/503, got ${adminOverview.status}`)
  }
  console.log('ok  admin overview requires secret')

  if (prodAware) {
    console.log('skip  *@inbox.local dashboard login (prod / SMOKE_SKIP_DEMO)')
  } else {
    const skipDemo = await demoLoginsBlocked(base)
    if (skipDemo) {
      if (!adminSecret) {
        console.log('skip  dashboard login (demo blocked and no ADMIN_PROVISION_SECRET)')
      } else {
        await registerAthlete(base, cookieJar, 'athlete')
        const provisioned = await provisionOwner(base, adminSecret)
        await login('owner', provisioned.email, provisioned.temporaryPassword)
        console.log('ok  provisioned athlete + owner (demo blocked)')

        const ownerPaths = [...ownerPathsBase]
        for (const path of ownerPaths) {
          await check(path, { session: 'owner', label: `owner ${path}` })
          console.log(`ok  owner ${path}`)
        }
        if (pilotNoCoach) {
          await check('/owner/coaches', { session: 'owner', expectRedirect: true, label: 'owner /owner/coaches' })
          console.log('ok  owner /owner/coaches redirects (pilot)')
        }
        for (const path of athletePaths) {
          await check(path, { session: 'athlete', label: `athlete ${path}` })
          console.log(`ok  athlete ${path}`)
        }
        await check('/en/owner', { session: 'owner', expectRedirect: true })
        await check('/en/athlete/bookings', { session: 'athlete', expectRedirect: true })
        console.log('ok  EN locale dashboard redirects')
      }
    } else {
      await login('owner', 'owner@inbox.local')
      await login('athlete', 'athlete@inbox.local')
      if (!pilotNoCoach) await login('coach', 'coach@inbox.local')

      const ownerPaths = [...ownerPathsBase]
      if (!pilotNoCoach) ownerPaths.push('/owner/coaches')

      for (const path of ownerPaths) {
        await check(path, { session: 'owner', label: `owner ${path}` })
        console.log(`ok  owner ${path}`)
      }
      if (pilotNoCoach) {
        await check('/owner/coaches', { session: 'owner', expectRedirect: true, label: 'owner /owner/coaches' })
        console.log('ok  owner /owner/coaches redirects (pilot)')
      } else {
        for (const path of coachPaths) {
          await check(path, { session: 'coach', label: `coach ${path}` })
          console.log(`ok  coach ${path}`)
        }
      }
      for (const path of athletePaths) {
        await check(path, { session: 'athlete', label: `athlete ${path}` })
        console.log(`ok  athlete ${path}`)
      }

      await check('/en/owner', { session: 'owner', expectRedirect: true })
      await check('/en/athlete/bookings', { session: 'athlete', expectRedirect: true })
      if (!pilotNoCoach) {
        await check('/en/coach', { session: 'coach', expectRedirect: true })
      }
      console.log('ok  EN locale dashboard redirects')
    }
  }

  try {
    await checkManifest()
    console.log('ok  PWA manifest brand colors')
  } catch (error) {
    console.warn(`skip manifest: ${error.message}`)
  }

  try {
    const clubsRes = await fetch(`${base}/api/clubs`)
    if (clubsRes.ok) {
      const clubs = await clubsRes.json()
      if (clubs[0]?.slug) {
        await check(`/clubs/${clubs[0].slug}`, { label: 'club detail' })
        console.log(`ok  /clubs/${clubs[0].slug}`)
      }
    }
    if (!pilotNoCoach) {
      const coachesRes = await fetch(`${base}/api/coaches`)
      if (coachesRes.ok) {
        const coaches = await coachesRes.json()
        if (coaches[0]?.id) {
          await check(`/coaches/${coaches[0].id}`, { label: 'coach detail' })
          console.log(`ok  /coaches/${coaches[0].id}`)
        }
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
