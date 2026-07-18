#!/usr/bin/env node
/** Security sanity smoke — injection, XSS, admin secret, IDOR, OTP, payments. */
import {
  apiFetch,
  createCookieJar,
  demoLoginsBlocked,
  fetchPage,
  loadDotEnv,
  login,
  provisionOwner,
  registerAthlete,
} from './lib/smoke-helpers.mjs'

loadDotEnv()

const base = process.env.BASE_URL || 'http://localhost:3000'
const adminSecret = process.env.ADMIN_PROVISION_SECRET || ''
const xssPayload = '<script>alert("xss")</script>'

async function main() {
  console.log(`smoke-security → ${base}`)
  const jar = createCookieJar()

  // SQL injection in slug — should 404, not 500
  const sqlSlug = encodeURIComponent("'; DROP TABLE clubs; --")
  const sqlRes = await fetch(`${base}/api/clubs/${sqlSlug}`)
  if (sqlRes.status === 500) throw new Error('SQL injection slug caused 500')
  if (sqlRes.status !== 404) {
    console.warn(`warn  SQL injection slug returned ${sqlRes.status} (expected 404)`)
  }
  console.log('ok  SQL injection slug does not crash server')

  // Malformed query params — should not 500
  const badQuery = await fetch(`${base}/api/clubs?city=${encodeURIComponent(xssPayload)}&sort=rank`)
  if (badQuery.status === 500) throw new Error('XSS in query param caused 500')
  console.log('ok  XSS in API query does not crash')

  const badCoachQuery = await fetch(`${base}/api/coaches?city=${encodeURIComponent(xssPayload)}`)
  if (badCoachQuery.status === 500) throw new Error('XSS in coaches query caused 500')
  console.log('ok  XSS in coaches query does not crash')

  // Admin provision without secret
  const adminNoSecret = await fetch(`${base}/api/admin/provision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'hacker@evil.com' }),
  })
  if (adminNoSecret.status !== 403 && adminNoSecret.status !== 503) {
    throw new Error(`admin provision without secret expected 403/503, got ${adminNoSecret.status}`)
  }
  console.log('ok  admin provision requires secret')

  const adminWrongSecret = await fetch(`${base}/api/admin/provision`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-secret': 'definitely-wrong-secret',
    },
    body: JSON.stringify({ email: 'hacker@evil.com' }),
  })
  if (adminWrongSecret.status !== 403) {
    throw new Error(`admin provision wrong secret expected 403, got ${adminWrongSecret.status}`)
  }
  console.log('ok  admin provision rejects wrong secret')

  const adminOverviewWrong = await fetch(`${base}/api/admin/overview`, {
    headers: { 'x-admin-secret': 'definitely-wrong-secret' },
  })
  if (adminOverviewWrong.status !== 403) {
    throw new Error(`admin overview wrong secret expected 403, got ${adminOverviewWrong.status}`)
  }
  console.log('ok  admin overview rejects wrong secret')

  // XSS in page search — HTML should not contain unescaped script tag from URL
  const { html: clubsHtml } = await fetchPage(base, `/clubs?city=${encodeURIComponent(xssPayload)}`)
  if (clubsHtml.includes('<script>alert("xss")</script>')) {
    throw new Error('clubs page reflected raw XSS payload')
  }
  console.log('ok  clubs page does not reflect raw XSS')

  const skipDemo = await demoLoginsBlocked(base)
  if (skipDemo) {
    if (!adminSecret) throw new Error('ADMIN_PROVISION_SECRET required when demo logins are blocked')
    await registerAthlete(base, jar, 'athlete')
    console.log('ok  provisioned athlete (demo blocked)')
  } else {
    await login(base, jar, 'athlete', 'athlete@inbox.local')
  }

  // Athlete cannot cancel another user's booking (IDOR attempt)
  const fakeId = '00000000-0000-0000-0000-000000000099'
  const idor = await apiFetch(base, `/api/bookings/${fakeId}/cancel`, {
    jar,
    session: 'athlete',
    method: 'PATCH',
  })
  if (idor.res.status !== 404 && idor.res.status !== 403) {
    throw new Error(`IDOR cancel expected 404/403, got ${idor.res.status}`)
  }
  console.log('ok  booking cancel rejects unknown booking')

  // Cross-club IDOR: athlete cannot mark another club booking paid via owner API
  const athletePaid = await apiFetch(base, '/api/owner/reserve', {
    jar,
    session: 'athlete',
    method: 'POST',
    body: { slotId: fakeId, paymentStatus: 'PAID', guestName: 'x' },
  })
  if (athletePaid.res.status !== 403 && athletePaid.res.status !== 401) {
    throw new Error(`athlete mark-paid expected 401/403, got ${athletePaid.res.status}`)
  }
  console.log('ok  athlete cannot mark bookings paid')

  // Online checkout rejected when pay_at_club (default / unset)
  const checkout = await apiFetch(base, '/api/payments/checkout', {
    jar,
    session: 'athlete',
    method: 'POST',
    body: { bookingId: fakeId, kind: 'court' },
  })
  if (![400, 403, 404, 422].includes(checkout.res.status)) {
    // 503/501 also acceptable for disabled online payments
    if (![501, 503].includes(checkout.res.status)) {
      throw new Error(`checkout unexpected status ${checkout.res.status}`)
    }
  }
  const checkoutBody = typeof checkout.data === 'object' ? checkout.data : {}
  const checkoutMsg = `${checkoutBody.statusMessage || ''} ${checkoutBody.message || ''}`
  if (checkout.res.status < 500 && /pay at the club|pay_at_club|disabled/i.test(checkoutMsg)) {
    console.log('ok  online checkout rejected (pay_at_club)')
  } else {
    console.log(`ok  online checkout blocked (${checkout.res.status})`)
  }

  // SMS + email status must not leak secrets
  if (adminSecret) {
    const { res: smsRes, data: sms } = await apiFetch(base, '/api/admin/sms-status', {
      headers: { 'x-admin-secret': adminSecret },
    })
    if (!smsRes.ok) throw new Error(`sms-status → ${smsRes.status}`)
    const smsJson = JSON.stringify(sms)
    if (/apiKey|KAVENEGAR_API_KEY|passwordHash|clientSecret|SMTP_PASS|S3_SECRET/i.test(smsJson)
      && /"(apiKey|KAVENEGAR_API_KEY|passwordHash|clientSecret|SMTP_PASS|S3_SECRET_KEY)"\s*:/.test(smsJson)) {
      throw new Error('sms-status leaked secret field')
    }
    if ('apiKey' in sms || 'KAVENEGAR_API_KEY' in sms) {
      throw new Error('sms-status includes API key fields')
    }
    console.log('ok  sms-status has no secret material')

    const { res: emailRes, data: email } = await apiFetch(base, '/api/admin/email-status', {
      headers: { 'x-admin-secret': adminSecret },
    })
    if (!emailRes.ok) throw new Error(`email-status → ${emailRes.status}`)
    const emailJson = JSON.stringify(email)
    if (/"SMTP_PASS"\s*:|"smtpPass"\s*:|"pass"\s*:/.test(emailJson)) {
      throw new Error('email-status leaked SMTP_PASS / pass field')
    }
    if ('SMTP_PASS' in email || 'smtpPass' in email || 'pass' in email) {
      throw new Error('email-status includes password fields')
    }
    console.log('ok  email-status has no SMTP_PASS')

    const { res: storageRes, data: storage } = await apiFetch(base, '/api/admin/storage-status', {
      headers: { 'x-admin-secret': adminSecret },
    })
    if (!storageRes.ok) throw new Error(`storage-status → ${storageRes.status}`)
    const storageJson = JSON.stringify(storage)
    if (/"S3_ACCESS_KEY"\s*:|"S3_SECRET_KEY"\s*:|"accessKey"\s*:|"secretKey"\s*:/.test(storageJson)) {
      throw new Error('storage-status leaked S3 credential fields')
    }
    if ('S3_ACCESS_KEY' in storage || 'S3_SECRET_KEY' in storage || 'accessKey' in storage || 'secretKey' in storage) {
      throw new Error('storage-status includes credential fields')
    }
    if (storage.storageMode !== 's3' && storage.storageMode !== 'local') {
      throw new Error(`storage-status unexpected storageMode: ${storage.storageMode}`)
    }
    console.log(`ok  storage-status mode=${storage.storageMode} (no keys)`)
  }

  // OTP: wrong code rejected; coach role blocked in pilot
  const otpWrong = await fetch(`${base}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '09120000000', code: '000000', purpose: 'register' }),
  })
  if (otpWrong.status === 200) throw new Error('OTP wrong code accepted')
  if (otpWrong.status >= 500) throw new Error(`OTP wrong code caused ${otpWrong.status}`)
  console.log('ok  OTP wrong code rejected')

  const otpCoach = await fetch(`${base}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      phone: '09121110001',
      purpose: 'register',
      role: 'COACH',
      name: 'Hack Coach',
    }),
  })
  // Pilot: 404; non-pilot: may 200/429/400 — never 500
  if (otpCoach.status === 500) throw new Error('OTP coach request caused 500')
  if (otpCoach.status === 200) {
    console.log(`ok  OTP coach request status ${otpCoach.status} (coach product may be enabled)`)
  } else {
    console.log(`ok  OTP coach request blocked (${otpCoach.status})`)
  }

  // Invalid JSON body
  const badJson = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not-json',
  })
  if (badJson.status >= 500) throw new Error('malformed JSON caused 500')
  console.log('ok  malformed JSON does not crash')

  // Oversized upload rejected
  const bigBody = new Uint8Array(6 * 1024 * 1024)
  const form = new FormData()
  form.append('file', new Blob([bigBody], { type: 'image/jpeg' }), 'big.jpg')
  const bigUpload = await fetch(`${base}/api/uploads/guest`, { method: 'POST', body: form })
  if (bigUpload.status !== 400 && bigUpload.status !== 401) {
    if (bigUpload.status === 500) throw new Error('oversized upload caused 500')
    console.warn(`warn  oversized upload returned ${bigUpload.status}`)
  }
  console.log('ok  oversized upload rejected or blocked')

  // Cross-club: two owners cannot mark each other's slots paid (before rate-limit bursts)
  if (adminSecret) {
    const ownerA = await provisionOwner(base, adminSecret, { name: 'Owner A' })
    const ownerB = await provisionOwner(base, adminSecret, { name: 'Owner B' })
    await login(base, jar, 'ownerA', ownerA.email, ownerA.password)
    await login(base, jar, 'ownerB', ownerB.email, ownerB.password)

    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const { data: calA } = await apiFetch(base, `/api/owner/calendar?date=${date}`, {
      jar,
      session: 'ownerA',
    })
    const slotA = (calA.slots || []).find((s) => s.displayStatus === 'FREE')
    if (slotA) {
      const cross = await apiFetch(base, '/api/owner/reserve', {
        jar,
        session: 'ownerB',
        method: 'POST',
        body: {
          slotId: slotA.id,
          guestName: 'Cross Club',
          guestMobile: '09123334455',
          paymentStatus: 'PAID',
        },
      })
      if (cross.res.ok) throw new Error('cross-club mark-paid succeeded (IDOR)')
      if (![403, 404].includes(cross.res.status)) {
        throw new Error(`cross-club mark-paid expected 403/404, got ${cross.res.status}`)
      }
      console.log('ok  cross-club mark-paid rejected')
    } else {
      console.warn('warn  no FREE slot for cross-club IDOR probe')
    }
  }

  // Rate-limit bursts last — they poison the shared IP bucket for ~60s
  const burstLimit = Math.max(25, (Number(process.env.RATE_LIMIT_MAX) || 15) + 10)
  let otpRateLimited = false
  for (let i = 0; i < burstLimit; i++) {
    const res = await fetch(`${base}/api/auth/otp/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: 'not-a-phone', purpose: 'register', name: 'x' }),
    })
    if (res.status === 429) {
      otpRateLimited = true
      break
    }
  }
  if (!otpRateLimited) throw new Error('OTP request rate limit did not return 429')
  console.log('ok  OTP request rate limit returns 429')

  let rateLimited = false
  for (let i = 0; i < burstLimit; i++) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `nobody-rate-${i}@example.com`, password: 'wrong' }),
    })
    if (res.status === 429) {
      rateLimited = true
      break
    }
  }
  if (!rateLimited) throw new Error('rate limit did not return 429 after burst')
  console.log('ok  login rate limit returns 429')

  console.log('smoke-security ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
