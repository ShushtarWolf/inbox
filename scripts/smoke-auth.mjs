#!/usr/bin/env node
/** Auth & authorization smoke — role boundaries and session handling. */
import {
  apiFetch,
  createCookieJar,
  login,
} from './lib/smoke-helpers.mjs'

const base = process.env.BASE_URL || 'http://localhost:3000'

async function main() {
  console.log(`smoke-auth → ${base}`)
  const jar = createCookieJar()

  // Invalid login
  const badLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'athlete@inbox.local', password: 'wrong-password' }),
  })
  if (badLogin.status !== 401) throw new Error(`wrong password expected 401, got ${badLogin.status}`)
  console.log('ok  rejects wrong password')

  const missingPassword = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'athlete@inbox.local' }),
  })
  if (missingPassword.status !== 400) throw new Error(`missing password expected 400, got ${missingPassword.status}`)
  console.log('ok  rejects missing password')

  // Unauthenticated me
  const meGuest = await fetch(`${base}/api/auth/me`)
  if (meGuest.status !== 401) throw new Error(`/api/auth/me guest expected 401, got ${meGuest.status}`)
  console.log('ok  unauthenticated /api/auth/me returns 401')

  // Open redirect rejected in login response
  const openRedirect = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'athlete@inbox.local',
      password: 'demo1234',
      returnTo: 'https://evil.com',
    }),
  })
  if (!openRedirect.ok) throw new Error(`login with returnTo failed: ${openRedirect.status}`)
  const loginBody = await openRedirect.json()
  if (loginBody.redirectTo?.includes('evil.com')) {
    throw new Error('login accepted external returnTo redirect')
  }
  console.log('ok  login sanitizes open redirect')

  await login(base, jar, 'athlete', 'athlete@inbox.local')
  await login(base, jar, 'owner', 'owner@inbox.local')
  await login(base, jar, 'coach', 'coach@inbox.local')

  const { res: meAthlete } = await apiFetch(base, '/api/auth/me', { jar, session: 'athlete' })
  if (!meAthlete.ok) throw new Error('authenticated /api/auth/me failed')
  console.log('ok  authenticated /api/auth/me')

  // Cross-role authorization
  const athleteOwner = await apiFetch(base, '/api/owner/finance', { jar, session: 'athlete' })
  if (athleteOwner.res.status !== 403) {
    throw new Error(`athlete /api/owner/finance expected 403, got ${athleteOwner.res.status}`)
  }
  console.log('ok  athlete blocked from owner finance API')

  const coachOwner = await apiFetch(base, '/api/owner/staff', { jar, session: 'coach' })
  if (coachOwner.res.status !== 403) {
    throw new Error(`coach /api/owner/staff expected 403, got ${coachOwner.res.status}`)
  }
  console.log('ok  coach blocked from owner staff API')

  const { res: ownerFinance } = await apiFetch(base, '/api/owner/finance', { jar, session: 'owner' })
  if (!ownerFinance.ok) throw new Error(`owner finance expected 200, got ${ownerFinance.res.status}`)
  console.log('ok  owner can access finance API')

  const { res: coachToday } = await apiFetch(base, '/api/coach/today', { jar, session: 'coach' })
  if (!coachToday.ok) throw new Error(`coach today expected 200, got ${coachToday.res.status}`)
  console.log('ok  coach can access coach API')

  const athleteCoach = await apiFetch(base, '/api/coach/today', { jar, session: 'athlete' })
  if (athleteCoach.res.status !== 403) {
    throw new Error(`athlete /api/coach/today expected 403, got ${athleteCoach.res.status}`)
  }
  console.log('ok  athlete blocked from coach API')

  // Logout
  const logout = await apiFetch(base, '/api/auth/logout', { jar, session: 'athlete', method: 'POST' })
  if (!logout.res.ok) throw new Error(`logout failed: ${logout.res.status}`)
  const meAfterLogout = await fetch(`${base}/api/auth/me`, { headers: { cookie: jar.get('athlete') || '' } })
  if (meAfterLogout.status !== 401) {
    throw new Error(`me after logout expected 401, got ${meAfterLogout.status}`)
  }
  console.log('ok  logout clears session')

  // Google OAuth: fail-closed when unset; redirect to Google when configured
  const googleRes = await fetch(`${base}/auth/google`, { redirect: 'manual' })
  const googleLoc = googleRes.headers.get('location') || ''
  const googleStatus = googleRes.status
  if (![301, 302, 303, 307, 308].includes(googleStatus)) {
    throw new Error(`/auth/google expected redirect, got ${googleStatus}`)
  }

  const loginWithGoogleError = await fetch(`${base}/login?error=google`)
  if (!loginWithGoogleError.ok) throw new Error(`/login?error=google expected 200, got ${loginWithGoogleError.status}`)
  const errorHtml = await loginWithGoogleError.text()
  if (!errorHtml.includes('ورود با گوگل انجام نشد') && !errorHtml.includes('Google sign-in failed')) {
    throw new Error('/login?error=google missing FA/EN googleFailed message')
  }
  console.log('ok  /login?error=google shows googleFailed UX')

  if (googleLoc.includes('error=google')) {
    const loginPage = await fetch(`${base}/login`)
    if (!loginPage.ok) throw new Error(`/login expected 200, got ${loginPage.status}`)
    const loginHtml = await loginPage.text()
    if (loginHtml.includes('btn-google') || loginHtml.includes('ادامه با گوگل') || loginHtml.includes('Continue with Google')) {
      throw new Error('Google button visible while OAuth is unset (expected fail-closed)')
    }
    console.log('ok  Google OAuth fail-closed (button hidden, /auth/google → login?error=google)')
  } else if (/accounts\.google\.com|google\.com\/o\/oauth2|googleapis\.com/.test(googleLoc)) {
    const loginPage = await fetch(`${base}/login`)
    const loginHtml = await loginPage.text()
    if (!loginHtml.includes('btn-google') && !loginHtml.includes('ادامه با گوگل')) {
      throw new Error('Google OAuth configured but button missing on /login')
    }
    console.log('ok  Google OAuth configured (button visible, /auth/google → Google)')
  } else {
    throw new Error(`unexpected /auth/google Location: ${googleStatus} ${googleLoc}`)
  }

  console.log('smoke-auth ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
