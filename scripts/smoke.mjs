#!/usr/bin/env node
/** Smoke test — run after `npm run dev` or against BASE_URL */
const base = process.env.BASE_URL || 'http://localhost:3000'
const cookieJar = new Map()
const oneDayMs = 24 * 60 * 60 * 1000
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateOffset(days) {
  return new Date(Date.now() + days * oneDayMs).toISOString().slice(0, 10)
}

async function check(path, opts = {}) {
  const headers = new Headers(opts.headers || {})
  if (opts.session && cookieJar.has(opts.session)) {
    headers.set('cookie', cookieJar.get(opts.session))
  }
  const res = await fetch(`${base}${path}`, { ...opts, headers })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  if (setCookies.length && opts.session) {
    const merged = new Map()
    const previous = cookieJar.get(opts.session)
    if (previous) {
      for (const item of previous.split('; ')) {
        const [key, ...rest] = item.split('=')
        merged.set(key, rest.join('='))
      }
    }
    for (const entry of setCookies) {
      const [pair] = entry.split(';')
      const [key, ...rest] = pair.split('=')
      merged.set(key, rest.join('='))
    }
    cookieJar.set(opts.session, [...merged.entries()].map(([key, value]) => `${key}=${value}`).join('; '))
  }
  return res.json()
}

async function main() {
  const futureDate = dateOffset(2)
  await check('/api/health')
  await check('/api/sports')
  const clubs = await check('/api/clubs?city=%D8%AA%D9%87%D8%B1%D8%A7%D9%86&verified=true&sort=rank')
  if (!Array.isArray(clubs) || !clubs[0]?.slug) {
    throw new Error(`Expected seeded Tehran clubs, got: ${JSON.stringify(clubs)}`)
  }
  const club = await check(`/api/clubs/${clubs[0].slug}`)
  await check(`/api/slots/available?club=${clubs[0].slug}&date=${futureDate}`)
  const coaches = await check('/api/coaches?verified=true&sort=rank')
  await check(`/api/coaches/${coaches[0].id}`)
  let availability = await check(`/api/coaches/${coaches[0].id}/availability?date=${futureDate}`)
  let coachDate = futureDate
  for (let offset = 3; offset < 8 && availability.slots.length < 2; offset++) {
    coachDate = dateOffset(offset)
    availability = await check(`/api/coaches/${coaches[0].id}/availability?date=${coachDate}`)
  }

  await check('/api/auth/login', {
    method: 'POST',
    session: 'athlete',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'athlete@inbox.local', password: 'demo1234' }),
  })
  await check('/api/auth/login', {
    method: 'POST',
    session: 'owner',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@inbox.local', password: 'demo1234' }),
  })

  const slots = await check(`/api/slots/available?club=${clubs[0].slug}&date=${futureDate}`)
  if (slots.length >= 2) {
    const createdBooking = await check('/api/bookings/court', {
      method: 'POST',
      session: 'athlete',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slotId: slots[0].id }),
    })
    await check(`/api/bookings/${createdBooking.id}/reschedule`, {
      method: 'PATCH',
      session: 'athlete',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slotId: slots[1].id }),
    })
    await check(`/api/bookings/${createdBooking.id}/cancel`, {
      method: 'PATCH',
      session: 'athlete',
    })
  }

  if (availability.slots.length >= 2) {
    const createdCoachSession = await check('/api/bookings/coach', {
      method: 'POST',
      session: 'athlete',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        coachId: coaches[0].id,
        date: coachDate,
        startTime: availability.slots[0].startTime,
      }),
    })
    await check(`/api/coach-sessions/${createdCoachSession.id}/reschedule`, {
      method: 'PATCH',
      session: 'athlete',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        date: coachDate,
        startTime: availability.slots[1].startTime,
      }),
    })
    await check('/api/payments/checkout', {
      method: 'POST',
      session: 'athlete',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ coachSessionId: createdCoachSession.id }),
    })
    console.log('ok  coach session checkout')
  }

  await check('/api/owner/contacts?segment=vip', { session: 'owner' })
  const smsStatus = await check('/api/owner/sms-status', { session: 'owner' })
  if (!smsStatus.resolvedProvider || !['log', 'live'].includes(smsStatus.resolvedProvider)) {
    throw new Error('owner sms-status did not return resolvedProvider')
  }
  if (Boolean(smsStatus.live) !== (smsStatus.resolvedProvider === 'live')) {
    throw new Error('owner sms-status live flag inconsistent with resolvedProvider')
  }
  console.log(`ok  owner sms-status (${smsStatus.resolvedProvider})`)
  await check('/api/owner/finance', { session: 'owner' })
  await check('/api/owner/staff', { session: 'owner' })
  await check('/api/owner/calendar', { session: 'owner' })
  await check('/api/owner/courts', { session: 'owner' })

  const seasonDate = dateOffset(21)
  const calendar = await check(`/api/owner/calendar?date=${seasonDate}`, { session: 'owner' })
  const freeSlots = (calendar.slots || []).filter((slot) => slot.displayStatus === 'FREE')
  if (freeSlots.length >= 1) {
    const seasonSlot = freeSlots[0]
    const weekday = DAY_NAMES[new Date(`${seasonSlot.date}T12:00:00Z`).getUTCDay()]
    const seasonResult = await check('/api/owner/season', {
      method: 'POST',
      session: 'owner',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        guestName: 'Smoke',
        guestFamily: 'Season',
        guestMobile: '09120000099',
        slotId: seasonSlot.id,
        startDate: seasonSlot.date,
        finishDate: dateOffset(56),
        days: [weekday],
        times: [seasonSlot.startTime.slice(0, 5)],
      }),
    })
    if (!seasonResult.slotsCreated || seasonResult.slotsCreated < 1) {
      throw new Error('season reserve did not create recurring slots')
    }
  }

  const packageDate = dateOffset(28)
  const packageCalendar = await check(`/api/owner/calendar?date=${packageDate}`, { session: 'owner' })
  const packageSlot = (packageCalendar.slots || []).find((slot) => slot.displayStatus === 'FREE')
  if (packageSlot) {
    const weekday = DAY_NAMES[new Date(`${packageSlot.date}T12:00:00Z`).getUTCDay()]
    const packageResult = await check('/api/owner/package-reserve', {
      method: 'POST',
      session: 'owner',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        guestName: 'Smoke',
        guestFamily: 'Package',
        guestMobile: '09120000098',
        slotId: packageSlot.id,
        startDate: packageSlot.date,
        finishDate: dateOffset(84),
        days: [weekday],
        times: [packageSlot.startTime.slice(0, 5)],
      }),
    })
    if (!packageResult.slotsCreated || packageResult.slotsCreated < 1) {
      throw new Error('package reserve did not create recurring slots')
    }
  }
  const smsResult = await check('/api/owner/sms', {
    method: 'POST',
    session: 'owner',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Smoke reminder',
      recipient: 'vip',
      campaignName: 'Smoke campaign',
    }),
  })
  if (!smsResult.provider || !['log', 'live'].includes(smsResult.provider)) {
    throw new Error('owner SMS did not return a resolved provider')
  }
  if (smsResult.provider === 'log') {
    if (!(smsResult.note?.includes('log') || smsResult.note?.includes('dry-run')) || smsResult.log?.sent) {
      throw new Error('owner SMS log mode claimed a live send')
    }
    console.log('ok  owner SMS log provider')
  } else {
    if (!smsResult.log?.sent && !smsResult.note?.toLowerCase?.().includes('live')) {
      throw new Error('owner SMS live mode did not report a send/queue')
    }
    console.log('ok  owner SMS live provider')
  }

  await check('/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clubSlug: club.slug,
      date: futureDate,
      startTime: '21:00',
      endTime: '22:00',
      guestName: 'Smoke User',
      guestMobile: '09120000001',
    }),
  })

  await check('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'athlete@inbox.local' }),
  })
  await check('/api/notifications', { session: 'athlete' })

  if (slots.length >= 1) {
    const booking = await check('/api/bookings/court', {
      method: 'POST',
      session: 'athlete',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slotId: slots[0].id }),
    })
    await check('/api/payments/checkout', {
      method: 'POST',
      session: 'athlete',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingId: booking.id }),
    })
    await check(`/api/bookings/${booking.id}/cancel`, { method: 'PATCH', session: 'athlete' })
  }

  console.log('smoke ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
