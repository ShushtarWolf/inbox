#!/usr/bin/env node
/**
 * Behnaz pilot happy-path smoke — provision → desk reserve/paid → athlete book → admin SMS.
 *
 * Requires server on BASE_URL (default http://localhost:3000) and ADMIN_PROVISION_SECRET
 * (from env or .env). Log SMS mode is enough; does not require live Kavenegar.
 *
 * Usage: npm run smoke:pilot
 */
import {
  apiFetch,
  createCookieJar,
  fetchPage,
  loadDotEnv,
  login,
  registerAthlete,
} from './lib/smoke-helpers.mjs'

loadDotEnv()

const base = process.env.BASE_URL || 'http://localhost:3000'
const adminSecret = process.env.ADMIN_PROVISION_SECRET || ''
const oneDayMs = 24 * 60 * 60 * 1000

function dateOffset(days) {
  return new Date(Date.now() + days * oneDayMs).toISOString().slice(0, 10)
}

function stamp() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function adminHeaders(extra = {}) {
  return { 'x-admin-secret': adminSecret, ...extra }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hasPilotNoCoach(html) {
  return /pilotNoCoach["']?\s*:\s*true/.test(html)
}

async function main() {
  console.log(`smoke-pilot → ${base}`)
  assert(adminSecret, 'ADMIN_PROVISION_SECRET is required (set in env or .env)')

  const jar = createCookieJar()
  const id = stamp()
  const ownerEmail = `pilot-owner-${id}@example.com`
  const guestMobile = '09121112233'

  const health = await apiFetch(base, '/api/health')
  assert(health.res.ok && health.data?.ok, '/api/health failed')
  console.log('ok  health')

  // --- 1. Admin provision CLUB_ADMIN ---
  const { res: provisionRes, data: provision } = await apiFetch(base, '/api/admin/provision', {
    method: 'POST',
    headers: adminHeaders(),
    body: {
      type: 'CLUB_ADMIN',
      email: ownerEmail,
      name: 'Pilot Owner',
      clubName: `Behnaz Pilot ${id}`,
      locale: 'en',
    },
  })
  assert(provisionRes.ok, `admin provision → ${provisionRes.status}`)
  assert(provision.role === 'CLUB_ADMIN', 'provision role is not CLUB_ADMIN')
  assert(provision.temporaryPassword, 'provision missing temporaryPassword')
  assert(provision.clubSlug, 'provision missing clubSlug')
  console.log(`ok  provision ${provision.clubSlug}`)

  // --- 2. Owner desk reserve + mark paid ---
  await login(base, jar, 'owner', ownerEmail, provision.temporaryPassword)
  console.log('ok  owner login')

  let freeSlot = null
  let reserveDate = null
  for (let offset = 2; offset < 10 && !freeSlot; offset++) {
    reserveDate = dateOffset(offset)
    const { res, data } = await apiFetch(base, `/api/owner/calendar?date=${reserveDate}`, {
      jar,
      session: 'owner',
    })
    assert(res.ok, `owner calendar → ${res.status}`)
    freeSlot = (data.slots || []).find((slot) => slot.displayStatus === 'FREE')
  }
  assert(freeSlot, 'no FREE calendar slot for desk reserve')

  const { res: reserveRes, data: reserve } = await apiFetch(base, '/api/owner/reserve', {
    jar,
    session: 'owner',
    method: 'POST',
    body: {
      slotId: freeSlot.id,
      guestName: 'Pilot Guest',
      guestMobile,
      paymentStatus: 'PAY_AT_CLUB',
      // Intentionally omit displayStatus — API must default FREE → RESERVED
    },
  })
  assert(reserveRes.ok, `owner reserve → ${reserveRes.status}: ${JSON.stringify(reserve)}`)
  assert(reserve.ok && reserve.paymentStatus === 'PAY_AT_CLUB', 'desk reserve did not create unpaid booking')

  const { data: afterReserve } = await apiFetch(base, `/api/owner/calendar?date=${reserveDate}`, {
    jar,
    session: 'owner',
  })
  const reservedSlot = (afterReserve.slots || []).find((slot) => slot.id === freeSlot.id)
  assert(reservedSlot?.displayStatus === 'RESERVED', `desk reserve left displayStatus=${reservedSlot?.displayStatus}`)
  assert(reservedSlot?.booking?.guestMobile === guestMobile, 'desk reserve missing guestMobile')
  console.log('ok  desk reserve (guestMobile, RESERVED)')

  // Season/package recurring reserve must stay disabled for court-booking MVP
  const { res: seasonRes } = await apiFetch(base, '/api/owner/season', {
    jar,
    session: 'owner',
    method: 'POST',
    body: {
      guestName: 'Pilot',
      guestFamily: 'Season',
      guestMobile,
      slotId: freeSlot.id,
      startDate: reserveDate,
      finishDate: dateOffset(60),
      days: ['Mon'],
      times: [freeSlot.startTime.slice(0, 5)],
    },
    expectStatus: 403,
  })
  assert(seasonRes.status === 403, `season reserve expected 403, got ${seasonRes.status}`)
  const { res: packageRes } = await apiFetch(base, '/api/owner/package-reserve', {
    jar,
    session: 'owner',
    method: 'POST',
    body: {
      guestName: 'Pilot',
      guestFamily: 'Package',
      guestMobile,
      slotId: freeSlot.id,
      startDate: reserveDate,
      finishDate: dateOffset(60),
      days: ['Mon'],
      times: [freeSlot.startTime.slice(0, 5)],
    },
    expectStatus: 403,
  })
  assert(packageRes.status === 403, `package reserve expected 403, got ${packageRes.status}`)
  console.log('ok  season/package reserve disabled (403)')

  const { res: ownerPackagesCreate } = await apiFetch(base, '/api/owner/packages', {
    jar,
    session: 'owner',
    method: 'POST',
    body: { title: 'Should fail' },
    expectStatus: 403,
  })
  assert(ownerPackagesCreate.status === 403, `owner packages create expected 403, got ${ownerPackagesCreate.status}`)
  const { res: packagesPage } = await fetchPage(base, '/owner/packages', {
    jar,
    session: 'owner',
    expectStatus: 200,
  })
  assert(packagesPage.status === 200, `/owner/packages → ${packagesPage.status}`)
  console.log('ok  packages UI/API disabled (stub + 403 create)')

  // Notify path: mark paid with guestMobile only (no userId) — must not 500 in log SMS mode
  const { res: paidRes, data: paid } = await apiFetch(base, '/api/owner/reserve', {
    jar,
    session: 'owner',
    method: 'POST',
    body: {
      slotId: freeSlot.id,
      guestName: 'Pilot Guest',
      guestMobile,
      paymentStatus: 'PAID',
    },
  })
  assert(paidRes.ok, `mark paid → ${paidRes.status}: ${JSON.stringify(paid)}`)
  assert(paid.paymentStatus === 'PAID', 'mark paid did not set PAID')
  console.log('ok  mark paid + guestMobile notify (no crash)')

  // --- 3. Admin SMS health + process-scheduled + /admin/sms page ---
  const { res: smsRes, data: sms } = await apiFetch(base, '/api/admin/sms-status', {
    headers: adminHeaders(),
  })
  assert(smsRes.ok, `admin sms-status → ${smsRes.status}`)
  assert(sms.ok === true, 'sms-status missing ok')
  assert(['log', 'live'].includes(sms.resolvedProvider), 'sms-status resolvedProvider invalid')
  assert(['log', 'live'].includes(sms.smsMode), 'sms-status smsMode invalid')
  assert(typeof sms.smsEnabledFlag === 'boolean', 'sms-status missing smsEnabledFlag')
  assert(typeof sms.isSmsEnabled === 'boolean', 'sms-status missing isSmsEnabled')
  assert(typeof sms.hasKavenegarApiKey === 'boolean', 'sms-status missing hasKavenegarApiKey')
  assert(!('apiKey' in sms) && !('KAVENEGAR_API_KEY' in sms), 'sms-status leaked API key')
  console.log(`ok  admin sms-status (${sms.resolvedProvider}, key=${sms.hasKavenegarApiKey})`)

  const { res: processRes, data: processResult } = await apiFetch(
    base,
    '/api/admin/sms/process-scheduled',
    { method: 'POST', headers: adminHeaders() },
  )
  assert(processRes.ok, `process-scheduled → ${processRes.status}`)
  assert(processResult.ok === true, 'process-scheduled missing ok')
  assert(['log', 'live'].includes(processResult.provider), 'process-scheduled provider invalid')
  console.log('ok  process-scheduled')

  const { res: smsPage } = await fetchPage(base, '/admin/sms', { expectStatus: 200 })
  assert(smsPage.status === 200, `/admin/sms → ${smsPage.status}`)
  console.log('ok  /admin/sms page')

  // --- 4. Athlete register (phone OTP) → find club → book → /athlete/bookings ---
  const athlete = await registerAthlete(base, jar, 'athlete', { name: 'Pilot Athlete' })
  assert(athlete.role === 'ATHLETE', 'register role is not ATHLETE')
  console.log('ok  athlete register (OTP)')

  const { res: clubRes, data: club } = await apiFetch(base, `/api/clubs/${provision.clubSlug}`)
  assert(clubRes.ok, `find club → ${clubRes.status}`)
  assert(club.slug === provision.clubSlug, 'club slug mismatch')
  console.log('ok  find club')

  let athleteSlot = null
  let bookDate = null
  for (let offset = 2; offset < 10 && !athleteSlot; offset++) {
    bookDate = dateOffset(offset)
    const { res, data } = await apiFetch(
      base,
      `/api/slots/available?club=${provision.clubSlug}&date=${bookDate}`,
    )
    assert(res.ok, `slots available → ${res.status}`)
    const slots = Array.isArray(data) ? data : (data.slots || [])
    athleteSlot = slots.find((slot) => slot.id !== freeSlot.id) || slots[0] || null
  }
  assert(athleteSlot, 'no available slot for athlete booking')
  assert(athleteSlot.id !== freeSlot.id, 'available API returned desk-reserved slot')

  const { res: bookRes, data: booking } = await apiFetch(base, '/api/bookings/court', {
    jar,
    session: 'athlete',
    method: 'POST',
    body: { slotId: athleteSlot.id },
  })
  assert(bookRes.ok, `athlete book → ${bookRes.status}: ${JSON.stringify(booking)}`)
  assert(booking.id, 'athlete booking missing id')

  const { res: mineRes, data: mine } = await apiFetch(base, '/api/bookings/mine', {
    jar,
    session: 'athlete',
  })
  assert(mineRes.ok, `bookings/mine → ${mineRes.status}`)
  const courtBookings = mine.courtBookings || []
  assert(
    courtBookings.some((row) => row.id === booking.id),
    'athlete booking not in /api/bookings/mine',
  )
  console.log('ok  athlete book + mine')

  const { res: bookingsPage } = await fetchPage(base, '/athlete/bookings', {
    jar,
    session: 'athlete',
    expectStatus: 200,
  })
  assert(bookingsPage.status === 200, `/athlete/bookings → ${bookingsPage.status}`)
  console.log('ok  /athlete/bookings')

  // --- 4b. Online pay (test mode) → PAID → cancel refund → wallet top-up ---
  const { res: checkoutRes, data: checkout } = await apiFetch(base, '/api/payments/checkout', {
    jar,
    session: 'athlete',
    method: 'POST',
    body: { bookingId: booking.id },
  })
  assert(checkoutRes.ok, `checkout → ${checkoutRes.status}: ${JSON.stringify(checkout)}`)
  const providerRef = checkout?.intent?.providerRef
  const provider = checkout?.intent?.provider || 'sep'
  if (providerRef && checkout?.intent?.status === 'PENDING_ONLINE') {
    const okPath = `/payments/callback/${provider}?ResNum=${encodeURIComponent(providerRef)}&State=OK`
    const first = await fetch(`${base}${okPath}`, { redirect: 'manual' })
    assert([302, 303].includes(first.status), `pay callback expected redirect, got ${first.status}`)
    const loc = first.headers.get('location') || ''
    assert(/payment=success/.test(loc), `pay success redirect missing: ${loc}`)
    const second = await fetch(`${base}${okPath}`, { redirect: 'manual' })
    assert([302, 303].includes(second.status), `pay double-callback expected redirect, got ${second.status}`)
    console.log('ok  online pay callback (idempotent)')

    const { res: payListRes, data: payList } = await apiFetch(base, '/api/athlete/payments', {
      jar,
      session: 'athlete',
    })
    assert(payListRes.ok, `athlete payments → ${payListRes.status}`)
    const rows = Array.isArray(payList) ? payList : (payList.payments || payList.items || [])
    assert(
      rows.some((row) => row.status === 'PAID' && (row.bookingId === booking.id || row.booking?.id === booking.id)),
      'PAID payment row missing after callback',
    )
    console.log('ok  /api/athlete/payments shows PAID')

    // Desk mark-unpaid must reject IPG PAID (cancel is the refund path)
    const { data: calAfterPay } = await apiFetch(base, `/api/owner/calendar?date=${bookDate}`, {
      jar,
      session: 'owner',
    })
    const paidSlot = (calAfterPay.slots || []).find((slot) => slot.id === athleteSlot.id)
    if (paidSlot?.booking) {
      const { res: unpaidRes } = await apiFetch(base, '/api/owner/reserve', {
        jar,
        session: 'owner',
        method: 'POST',
        body: {
          slotId: paidSlot.id,
          guestName: paidSlot.booking.guestName || 'x',
          paymentMethod: 'CASH',
          paymentStatus: 'PAY_AT_CLUB',
        },
        expectStatus: 409,
      })
      assert(unpaidRes.status === 409, `mark-unpaid IPG expected 409, got ${unpaidRes.status}`)
      console.log('ok  desk mark-unpaid blocked for IPG PAID (409)')
    }

    const { res: cancelRes, data: cancel } = await apiFetch(base, `/api/bookings/${booking.id}/cancel`, {
      jar,
      session: 'athlete',
      method: 'PATCH',
    })
    assert(cancelRes.ok, `cancel → ${cancelRes.status}: ${JSON.stringify(cancel)}`)
    assert(cancel.ok, 'cancel missing ok')
    // Retry cancel must still compensate refund if needed (idempotent)
    const { res: cancelRetryRes, data: cancelRetry } = await apiFetch(base, `/api/bookings/${booking.id}/cancel`, {
      jar,
      session: 'athlete',
      method: 'PATCH',
    })
    assert(cancelRetryRes.ok, `cancel retry → ${cancelRetryRes.status}`)
    assert(cancelRetry.ok, 'cancel retry missing ok')
    console.log('ok  athlete cancel + refund retry')

    const { res: walletBeforeRes, data: walletBefore } = await apiFetch(base, '/api/wallet', {
      jar,
      session: 'athlete',
    })
    assert(walletBeforeRes.ok, `wallet → ${walletBeforeRes.status}`)
    const balanceAfterCancel = Number(walletBefore.balance || 0)

    const { res: topupRes, data: topup } = await apiFetch(base, '/api/wallet/topup', {
      jar,
      session: 'athlete',
      method: 'POST',
      body: { amount: 50000 },
    })
    assert(topupRes.ok, `wallet topup → ${topupRes.status}: ${JSON.stringify(topup)}`)
    const topupRef = topup?.intent?.providerRef || topup?.providerRef
    assert(topupRef, 'topup missing providerRef')
    const topupCb = `/payments/callback/${topup?.intent?.provider || provider}?ResNum=${encodeURIComponent(topupRef)}&State=OK`
    const topupPay = await fetch(`${base}${topupCb}`, { redirect: 'manual' })
    assert([302, 303].includes(topupPay.status), `topup callback → ${topupPay.status}`)
    const { data: walletAfter } = await apiFetch(base, '/api/wallet', { jar, session: 'athlete' })
    const balAfterTopup = Number(walletAfter.balance || 0)
    assert(
      balAfterTopup >= balanceAfterCancel + 50000,
      `wallet balance did not rise after topup (${walletAfter.balance} vs ${balanceAfterCancel})`,
    )
    console.log('ok  wallet top-up via test IPG')

    // Spend full amount from wallet on a fresh booking
    let spendSlot = null
    for (let offset = 2; offset < 12 && !spendSlot; offset++) {
      const spendDate = dateOffset(offset)
      const { data } = await apiFetch(
        base,
        `/api/slots/available?club=${provision.clubSlug}&date=${spendDate}`,
      )
      const slots = Array.isArray(data) ? data : (data.slots || [])
      spendSlot = slots.find((slot) => slot.id !== athleteSlot.id && slot.id !== freeSlot.id) || slots[0] || null
    }
    assert(spendSlot, 'no slot for wallet spend')
    const { data: spendBook } = await apiFetch(base, '/api/bookings/court', {
      jar,
      session: 'athlete',
      method: 'POST',
      body: { slotId: spendSlot.id },
    })
    const { res: spendRes, data: spendPay } = await apiFetch(base, '/api/payments/checkout', {
      jar,
      session: 'athlete',
      method: 'POST',
      body: { bookingId: spendBook.id, useWallet: true },
    })
    assert(spendRes.ok && spendPay?.intent?.status === 'PAID', `wallet spend → ${spendRes.status}`)
    const { data: walletSpent } = await apiFetch(base, '/api/wallet', { jar, session: 'athlete' })
    assert(Number(walletSpent.balance) < balAfterTopup, 'wallet balance did not drop after spend')
    console.log('ok  wallet spend (useWallet checkout)')
  } else {
    console.log(`skip online pay path (status=${checkout?.intent?.status || 'n/a'})`)
  }

  // --- 5. Pilot no-coach gates (when runtime flag is on) ---
  const { html: homeHtml } = await fetchPage(base, '/')
  const pilotNoCoach = hasPilotNoCoach(homeHtml)
  if (pilotNoCoach) {
    const coaches = await fetchPage(base, '/coaches', { expectRedirect: true })
    const loc = coaches.res.headers.get('location') || ''
    assert(/\/clubs/.test(loc), `/coaches redirect expected /clubs, got ${loc || coaches.res.status}`)
    console.log('ok  /coaches redirects away')

    const ownerCoaches = await fetchPage(base, '/owner/coaches', {
      jar,
      session: 'owner',
      expectRedirect: true,
    })
    const ownerLoc = ownerCoaches.res.headers.get('location') || ''
    assert(
      /\/clubs/.test(ownerLoc),
      `/owner/coaches redirect expected /clubs, got ${ownerLoc || ownerCoaches.res.status}`,
    )
    console.log('ok  /owner/coaches redirects away')

    const { html: ownerHtml } = await fetchPage(base, '/owner/calendar', { jar, session: 'owner' })
    assert(hasPilotNoCoach(ownerHtml), 'owner calendar missing pilotNoCoach runtime flag')
    // Coach reserve CTA is client-gated by pilotNoCoach; shell must not render the label.
    assert(
      !/Reserve with coach/i.test(ownerHtml) && !/reserveWithCoach/.test(ownerHtml),
      'owner calendar unexpectedly includes coach reserve UI',
    )
    console.log('ok  owner calendar has no coach reserve UI')
  } else {
    console.log('skip pilot no-coach (pilotNoCoach not true on server)')
  }

  console.log('smoke-pilot ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
