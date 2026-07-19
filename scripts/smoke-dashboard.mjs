#!/usr/bin/env node
/** Dashboard route smoke — BASE_URL=http://localhost:3000 node scripts/smoke-dashboard.mjs */
import {
  createCookieJar,
  demoLoginsBlocked,
  isPilotNoCoachRuntime,
  isProdSmokeBase,
  loadDotEnv,
  login,
  provisionOwner,
  registerAthlete,
} from './lib/smoke-helpers.mjs'

loadDotEnv()

const base = process.env.BASE_URL || 'http://localhost:3000'
const prodAware = isProdSmokeBase(base)
const adminSecret = process.env.ADMIN_PROVISION_SECRET || ''
const cookieJar = createCookieJar()

async function checkHtml(path, session, { allowRedirect, expectRedirect, allowLocations } = {}) {
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
    const allowed = allowLocations || ['/login']
    if (!allowed.some((fragment) => location.includes(fragment))) {
      throw new Error(`${path} unexpected redirect → ${location}`)
    }
    return
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
}

async function main() {
  const pilotNoCoach = await isPilotNoCoachRuntime(base)
  console.log(`smoke-dashboard → ${base}${prodAware ? ' (prod-aware)' : ''}${pilotNoCoach ? ' (pilot)' : ''}`)

  await checkHtml('/owner', 'guest', { allowRedirect: true })
  await checkHtml('/athlete', 'guest', { allowRedirect: true })
  if (pilotNoCoach) {
    await checkHtml('/coach', 'guest', { allowRedirect: true, allowLocations: ['/clubs', '/login'] })
  } else {
    await checkHtml('/coach', 'guest', { allowRedirect: true })
  }

  const skipDemo = prodAware || await demoLoginsBlocked(base)
  if (skipDemo) {
    if (!adminSecret) {
      console.log('skip  dashboard login (demo blocked / prod and no ADMIN_PROVISION_SECRET)')
      console.log('dashboard smoke ok')
      return
    }
    await registerAthlete(base, cookieJar, 'athlete')
    const provisioned = await provisionOwner(base, adminSecret)
    await login(base, cookieJar, 'owner', provisioned.email, provisioned.temporaryPassword)
    console.log('ok  provisioned athlete + owner')
  } else {
    await login(base, cookieJar, 'owner', 'owner@inbox.local')
    await login(base, cookieJar, 'athlete', 'athlete@inbox.local')
    if (!pilotNoCoach) {
      await login(base, cookieJar, 'coach', 'coach@inbox.local')
    }
  }

  const ownerPaths = [
    '/owner',
    '/owner/finance',
    '/owner/equipments',
    '/owner/packages',
    '/owner/crm',
    '/owner/support',
    '/owner/settings',
  ]
  if (!pilotNoCoach && !skipDemo) ownerPaths.push('/owner/coaches')

  const coachPaths = ['/coach', '/coach/schedule', '/coach/clients', '/coach/profile']
  const athletePaths = ['/athlete', '/athlete/bookings', '/athlete/profile']

  for (const path of ownerPaths) await checkHtml(path, 'owner')
  if (pilotNoCoach) {
    await checkHtml('/owner/coaches', 'owner', { expectRedirect: true })
    console.log('ok  pilot owner /owner/coaches redirects')
  } else if (!skipDemo) {
    for (const path of coachPaths) await checkHtml(path, 'coach')
  }
  for (const path of athletePaths) await checkHtml(path, 'athlete')

  await checkHtml('/en/owner', 'owner', { expectRedirect: true })
  await checkHtml('/en/athlete/bookings', 'athlete', { expectRedirect: true })
  if (!pilotNoCoach && !skipDemo) {
    await checkHtml('/en/coach', 'coach', { expectRedirect: true })
  }

  console.log('dashboard smoke ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
