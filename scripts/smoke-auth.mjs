#!/usr/bin/env node
/** Auth & authorization smoke — role boundaries and session handling. */
import {
  apiFetch,
  createCookieJar,
  demoLoginsBlocked,
  isPilotNoCoachRuntime,
  loadDotEnv,
  login,
  loginViaOtp,
  provisionOwner,
  registerAthlete,
} from './lib/smoke-helpers.mjs'

loadDotEnv()

const base = process.env.BASE_URL || 'http://localhost:3000'
const adminSecret = process.env.ADMIN_PROVISION_SECRET || ''

async function main() {
  console.log(`smoke-auth → ${base}`)
  const jar = createCookieJar()
  const skipDemo = await demoLoginsBlocked(base)
  const pilotNoCoach = await isPilotNoCoachRuntime(base)
  if (skipDemo) console.log('note  demo *@inbox.local logins blocked (production) — using provisioned users')
  if (pilotNoCoach) console.log('note  pilotNoCoach=true — skipping coach role checks')

  // Invalid login (non-demo email so production demo gate does not mask 401)
  const badLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'nobody-smoke@example.com', password: 'wrong-password' }),
  })
  if (badLogin.status !== 401) throw new Error(`wrong password expected 401, got ${badLogin.status}`)
  console.log('ok  rejects wrong password')

  const missingPassword = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'nobody-smoke@example.com' }),
  })
  if (missingPassword.status !== 400) throw new Error(`missing password expected 400, got ${missingPassword.status}`)
  console.log('ok  rejects missing password')

  // Unauthenticated me — 401 or 200 with null user (nuxt-auth-utils empty session)
  const meGuest = await fetch(`${base}/api/auth/me`)
  if (meGuest.status === 401) {
    console.log('ok  unauthenticated /api/auth/me returns 401')
  } else if (meGuest.status === 200) {
    const meBody = await meGuest.json()
    if (meBody.user != null) throw new Error('/api/auth/me guest returned a user')
    console.log('ok  unauthenticated /api/auth/me returns null user')
  } else {
    throw new Error(`/api/auth/me guest expected 401/200, got ${meGuest.status}`)
  }

  // Guest blocked from owner / admin / athlete-sensitive APIs
  const guestOwner = await fetch(`${base}/api/owner/finance`)
  if (guestOwner.status !== 401 && guestOwner.status !== 403) {
    throw new Error(`guest /api/owner/finance expected 401/403, got ${guestOwner.status}`)
  }
  console.log('ok  guest blocked from owner API')

  const guestAdmin = await fetch(`${base}/api/admin/overview`)
  if (guestAdmin.status !== 401 && guestAdmin.status !== 403 && guestAdmin.status !== 503) {
    throw new Error(`guest /api/admin/overview expected 401/403/503, got ${guestAdmin.status}`)
  }
  console.log('ok  guest blocked from admin API')

  let athleteEmail = 'athlete@inbox.local'
  let athletePassword = 'demo1234'
  let athletePhone = null
  let ownerEmail = 'owner@inbox.local'
  let ownerPassword = 'demo1234'

  if (skipDemo) {
    if (!adminSecret) throw new Error('ADMIN_PROVISION_SECRET required when demo logins are blocked')
    const owner = await provisionOwner(base, adminSecret)
    ownerEmail = owner.email
    ownerPassword = owner.password
    const athlete = await registerAthlete(base, jar, 'athlete')
    athleteEmail = athlete.email
    athletePassword = athlete.password
    athletePhone = athlete.phone
  } else {
    await login(base, jar, 'athlete', athleteEmail, athletePassword)
    await login(base, jar, 'owner', ownerEmail, ownerPassword)
    if (!pilotNoCoach) {
      await login(base, jar, 'coach', 'coach@inbox.local')
    }
  }

  if (skipDemo) {
    // registerAthlete already set athlete session; login owner
    await login(base, jar, 'owner', ownerEmail, ownerPassword)
  }

  // Open redirect rejected in login response (password path for seed; OTP path for prod)
  if (athletePassword) {
    const openRedirect = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: athleteEmail,
        password: athletePassword,
        returnTo: 'https://evil.com',
      }),
    })
    if (!openRedirect.ok) throw new Error(`login with returnTo failed: ${openRedirect.status}`)
    const loginBody = await openRedirect.json()
    if (loginBody.redirectTo?.includes('evil.com')) {
      throw new Error('login accepted external returnTo redirect')
    }
  } else if (athletePhone) {
    const otpLogin = await loginViaOtp(base, jar, 'athlete', athletePhone)
    if (otpLogin.redirectTo?.includes('evil.com')) {
      throw new Error('OTP login accepted external returnTo redirect')
    }
  }
  console.log('ok  login sanitizes open redirect')

  const { res: meAthlete } = await apiFetch(base, '/api/auth/me', { jar, session: 'athlete' })
  if (!meAthlete.ok) throw new Error('authenticated /api/auth/me failed')
  console.log('ok  authenticated /api/auth/me')

  // Session cookie must be HttpOnly (check Set-Cookie from a fresh login)
  const cookieProbe = athletePassword
    ? await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: athleteEmail, password: athletePassword }),
      })
    : await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
      })
  const setCookies = typeof cookieProbe.headers.getSetCookie === 'function'
    ? cookieProbe.headers.getSetCookie()
    : []
  const sessionCookie = setCookies.find((c) => /session/i.test(c)) || setCookies[0] || ''
  if (sessionCookie && !/httponly/i.test(sessionCookie)) {
    throw new Error('session cookie missing HttpOnly')
  }
  if (sessionCookie) console.log('ok  session cookie is HttpOnly')
  else console.warn('warn  no Set-Cookie on login (may already be session-bound)')

  // Cross-role authorization
  const athleteOwner = await apiFetch(base, '/api/owner/finance', { jar, session: 'athlete' })
  if (athleteOwner.res.status !== 403) {
    throw new Error(`athlete /api/owner/finance expected 403, got ${athleteOwner.res.status}`)
  }
  console.log('ok  athlete blocked from owner finance API')

  const { res: ownerFinance } = await apiFetch(base, '/api/owner/finance', { jar, session: 'owner' })
  if (ownerFinance.status === 404 && adminSecret) {
    // Stale local DB: demo owner exists but has no staff membership
    console.log('note  owner finance 404 (no club) — provisioning temporary owner')
    const owner = await provisionOwner(base, adminSecret)
    ownerEmail = owner.email
    ownerPassword = owner.password
    await login(base, jar, 'owner', ownerEmail, ownerPassword)
    const retry = await apiFetch(base, '/api/owner/finance', { jar, session: 'owner' })
    if (!retry.res.ok) throw new Error(`owner finance expected 200 after provision, got ${retry.res.status}`)
  } else if (!ownerFinance.ok) {
    throw new Error(`owner finance expected 200, got ${ownerFinance.status}`)
  }
  console.log('ok  owner can access finance API')

  if (!pilotNoCoach && !skipDemo) {
    const coachOwner = await apiFetch(base, '/api/owner/staff', { jar, session: 'coach' })
    if (coachOwner.res.status !== 403) {
      throw new Error(`coach /api/owner/staff expected 403, got ${coachOwner.res.status}`)
    }
    console.log('ok  coach blocked from owner staff API')

    const { res: coachToday } = await apiFetch(base, '/api/coach/today', { jar, session: 'coach' })
    if (!coachToday.ok) throw new Error(`coach today expected 200, got ${coachToday.status}`)
    console.log('ok  coach can access coach API')

    const athleteCoach = await apiFetch(base, '/api/coach/today', { jar, session: 'athlete' })
    if (athleteCoach.res.status !== 403) {
      throw new Error(`athlete /api/coach/today expected 403, got ${athleteCoach.res.status}`)
    }
    console.log('ok  athlete blocked from coach API')
  } else if (pilotNoCoach) {
    const coachApi = await apiFetch(base, '/api/coach/today', { jar, session: 'athlete' })
    if (![403, 404].includes(coachApi.res.status)) {
      throw new Error(`pilot: athlete /api/coach/today expected 403/404, got ${coachApi.res.status}`)
    }
    console.log('ok  pilot: coach APIs gated')
  }

  // Password athlete register (MVP while SMS OTP is gated)
  const stamp = Date.now()
  const pwPhone = `0912${String(stamp).slice(-7)}`
  const pwJar = createCookieJar()
  const pwRegister = await apiFetch(base, '/api/auth/register', {
    jar: pwJar,
    session: 'pw-athlete',
    method: 'POST',
    body: {
      name: 'Password Athlete',
      phone: pwPhone,
      password: 'demo1234',
    },
  })
  if (!pwRegister.res.ok) throw new Error(`password register expected 200, got ${pwRegister.res.status}`)
  if (pwRegister.data.role !== 'ATHLETE') {
    throw new Error(`password register escalated to ${pwRegister.data.role}`)
  }
  console.log('ok  password athlete register without live SMS')

  const pwLoginPhone = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: pwPhone, password: 'demo1234' }),
  })
  if (!pwLoginPhone.ok) throw new Error(`phone password login expected 200, got ${pwLoginPhone.status}`)
  console.log('ok  login with phone + password')

  // Body role cannot escalate athlete password register to CLUB_ADMIN
  const escalate = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Escalator',
      email: `escalate-${stamp}@example.com`,
      password: 'demo1234',
      role: 'CLUB_ADMIN',
      locale: 'en',
    }),
  })
  if (!escalate.ok) throw new Error(`athlete register expected 200, got ${escalate.status}`)
  const escalateBody = await escalate.json()
  if (escalateBody.role !== 'ATHLETE') {
    throw new Error(`password register escalated to ${escalateBody.role}`)
  }
  console.log('ok  password register stays ATHLETE (ignores role escalation)')

  // Phone OTP register path still works in log mode (debugCode)
  const otpAthlete = await registerAthlete(base, createCookieJar(), 'otp-athlete', { viaOtp: true })
  if (otpAthlete.role !== 'ATHLETE') {
    throw new Error(`OTP register escalated to ${otpAthlete.role}`)
  }
  console.log('ok  OTP athlete register stays ATHLETE')

  // Logout
  const logout = await apiFetch(base, '/api/auth/logout', { jar, session: 'athlete', method: 'POST' })
  if (!logout.res.ok) throw new Error(`logout failed: ${logout.res.status}`)
  const meAfterLogout = await fetch(`${base}/api/auth/me`, { headers: { cookie: jar.get('athlete') || '' } })
  if (meAfterLogout.status === 401) {
    console.log('ok  logout clears session')
  } else if (meAfterLogout.status === 200) {
    const body = await meAfterLogout.json()
    if (body.user != null) throw new Error('me after logout still has user')
    console.log('ok  logout clears session (null user)')
  } else {
    throw new Error(`me after logout expected 401/200, got ${meAfterLogout.status}`)
  }

  // Google OAuth: product hard-off — route returns 404 even if env is set
  const googleRes = await fetch(`${base}/auth/google`, { redirect: 'manual' })
  const googleStatus = googleRes.status
  if (googleStatus !== 404) {
    throw new Error(`/auth/google expected 404 hard-off, got ${googleStatus}`)
  }
  console.log('ok  Google OAuth hard-off (/auth/google → 404)')

  const loginPage = await fetch(`${base}/login`)
  if (!loginPage.ok) throw new Error(`/login expected 200, got ${loginPage.status}`)
  const loginHtml = await loginPage.text()
  if (loginHtml.includes('btn-google') || loginHtml.includes('ادامه با گوگل') || loginHtml.includes('Continue with Google')) {
    throw new Error('Google button visible on /login (expected hidden for Iran MVP)')
  }
  console.log('ok  Google button hidden on /login')

  const googleEnabled = await fetch(`${base}/api/auth/google-enabled`)
  if (googleEnabled.ok) {
    const body = await googleEnabled.json()
    if (body.enabled) throw new Error('/api/auth/google-enabled expected enabled:false for Iran MVP')
    console.log('ok  /api/auth/google-enabled → enabled:false')
  }

  console.log('smoke-auth ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
