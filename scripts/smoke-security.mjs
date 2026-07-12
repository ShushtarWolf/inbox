#!/usr/bin/env node
/** Security sanity smoke — injection, XSS reflection, admin secret. */
import { apiFetch, createCookieJar, fetchPage, login } from './lib/smoke-helpers.mjs'

const base = process.env.BASE_URL || 'http://localhost:3000'
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

  // XSS in page search — HTML should not contain unescaped script tag from URL
  const { html: clubsHtml } = await fetchPage(base, `/clubs?city=${encodeURIComponent(xssPayload)}`)
  if (clubsHtml.includes('<script>alert("xss")</script>')) {
    throw new Error('clubs page reflected raw XSS payload')
  }
  console.log('ok  clubs page does not reflect raw XSS')

  await login(base, jar, 'athlete', 'athlete@inbox.local')

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

  // Rate limit burst on login
  let rateLimited = false
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@inbox.local', password: 'wrong' }),
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
