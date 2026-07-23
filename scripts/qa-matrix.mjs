#!/usr/bin/env node
/**
 * MVP QA matrix (FA only) — public shells + optional local demo role routes.
 * Prod-aware: skips *@inbox.local on production; always checks public FA pages.
 *
 * Manual human checklist (owner/athlete OTP, pay, SMS) lives in docs/LAUNCH_CHECKLIST.md.
 */
import { demoLoginsBlocked, isProdSmokeBase } from './lib/smoke-helpers.mjs'

const base = (process.env.BASE_URL || 'https://inboxs.ir').replace(/\/$/, '')

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
    if (![301, 302, 307, 308].includes(res.status)) throw new Error(`${path} expected redirect, got ${res.status}`)
    return { res, html: '' }
  }
  if (res.status !== expectStatus) throw new Error(`${path} → ${res.status}`)
  const html = await res.text()
  if (html.includes('__nuxt') === false && !html.includes('<!DOCTYPE')) {
    throw new Error(`${path} missing SPA shell`)
  }
  return { res, html }
}

/** Public FA pages required for Behnaz court MVP (no demo login). */
const publicFaPaths = [
  '/',
  '/clubs',
  '/login',
  '/contact',
  '/privacy',
  '/terms',
]

const localRoleMatrix = [
  { role: 'owner', paths: ['/owner', '/owner/finance', '/owner/crm', '/owner/packages'] },
  { role: 'athlete', paths: ['/athlete', '/athlete/bookings', '/athlete/profile'] },
]

async function main() {
  const prodAware = isProdSmokeBase(base) || await demoLoginsBlocked(base)
  console.log(`qa-matrix (FA MVP) → ${base}${prodAware ? ' (prod-aware)' : ''}`)
  assertNavActive()
  const failures = []

  for (const path of publicFaPaths) {
    try {
      const { html } = await check(path, 'guest')
      if (path === '/login') {
        if (/ادامه با گوگل|Continue with Google|AppGoogleSignIn|google-signin/i.test(html)) {
          throw new Error('Google OAuth UI leaked on /login')
        }
        console.log('ok  /login has no Google OAuth UI')
      }
      console.log(`ok  fa-public ${path}`)
    } catch (error) {
      failures.push({ path, error: error.message })
      console.error(`FAIL fa-public ${path}: ${error.message}`)
    }
  }

  // /coaches: redirect when pilot flag is on; 200 OK when off (local without flag)
  try {
    const res = await fetch(`${base}/coaches`, { redirect: 'manual' })
    if ([301, 302, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location') || ''
      if (!/\/clubs/.test(loc)) throw new Error(`/coaches redirected to ${loc || res.status}, expected /clubs`)
      console.log('ok  /coaches redirects to /clubs (pilot)')
    } else if (res.status === 200) {
      console.log('ok  /coaches 200 (pilot flag off on this host)')
    } else {
      throw new Error(`/coaches → ${res.status}`)
    }
  } catch (error) {
    failures.push({ path: '/coaches', error: error.message })
    console.error(`FAIL /coaches: ${error.message}`)
  }

  if (prodAware) {
    console.log('skip  *@inbox.local role logins (prod / SMOKE_SKIP_DEMO)')
    console.log('note  run manual OTP/pay/SMS rows in docs/LAUNCH_CHECKLIST.md on Liara after deploy')
  } else {
    for (const [session, email] of Object.entries(accounts)) {
      await login(session, email)
    }

    for (const row of localRoleMatrix) {
      for (const path of row.paths) {
        try {
          await check(path, row.role)
          console.log(`ok  ${row.role} fa ${path}`)
        } catch (error) {
          failures.push({ ...row, path, error: error.message })
          console.error(`FAIL ${row.role} fa ${path}: ${error.message}`)
        }
      }
    }

    try {
      await check('/owner/finance', 'athlete', { expectRedirect: true })
      console.log('ok  athlete blocked from owner')
    } catch (error) {
      failures.push({ path: '/owner/finance', error: error.message })
      console.error(`FAIL cross-role: ${error.message}`)
    }
  }

  if (failures.length) {
    console.error(`qa-matrix failed (${failures.length})`)
    process.exit(1)
  }
  console.log('qa-matrix ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
