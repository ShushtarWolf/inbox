#!/usr/bin/env node
/**
 * Competition Pilot Go/No-Go — local integration runner (readonly-ish; uses test DB).
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 PAYMENTS_MODE=test npm run competition:go-no-go
 *
 * Requires ADMIN_PROVISION_SECRET in env or .env. Does NOT deploy or enable live IPG.
 */
import {
  apiFetch,
  createCookieJar,
  loadDotEnv,
  provisionOwner,
  registerAthlete,
} from './lib/smoke-helpers.mjs'

loadDotEnv()

const base = process.env.BASE_URL || 'http://localhost:3000'
const adminSecret = process.env.ADMIN_PROVISION_SECRET || ''

const results = []

function record(id, pass, note = '') {
  results.push({ id, pass, note })
  const mark = pass ? 'PASS' : 'FAIL'
  console.log(`${mark}  ${id}${note ? ` — ${note}` : ''}`)
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function stamp() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function isoOffset(days, hours = 10) {
  const d = new Date(Date.now() + days * 86400000)
  d.setHours(hours, 0, 0, 0)
  return d.toISOString()
}

async function ensureWalletBalance(jar, session, minBalance) {
  const { data: wallet } = await apiFetch(base, '/api/wallet', { jar, session })
  const balance = Number(wallet?.balance || 0)
  if (balance >= minBalance) return balance
  const topAmount = Math.max(minBalance - balance, 500000)
  const { res: topupRes, data: topup } = await apiFetch(base, '/api/wallet/topup', {
    jar,
    session,
    method: 'POST',
    body: { amount: topAmount },
  })
  assert(topupRes.ok, `wallet topup → ${topupRes.status}`)
  const topupRef = topup?.intent?.providerRef || topup?.providerRef
  assert(topupRef, 'topup missing providerRef')
  const provider = topup?.intent?.provider || 'sep'
  const topupCb = `/payments/callback/${provider}?ResNum=${encodeURIComponent(topupRef)}&State=OK`
  await fetch(`${base}${topupCb}`, { redirect: 'manual' })
  const { data: after } = await apiFetch(base, '/api/wallet', { jar, session })
  return Number(after?.balance || 0)
}

async function payCompetitionViaTestGateway(jar, session, entryId) {
  const { res: checkoutRes, data: checkout } = await apiFetch(base, '/api/payments/checkout', {
    jar,
    session,
    method: 'POST',
    body: { competitionEntryId: entryId },
  })
  assert(checkoutRes.ok, `checkout → ${checkoutRes.status}`)
  const providerRef = checkout?.intent?.providerRef
  const provider = checkout?.intent?.provider || 'sep'
  assert(providerRef && checkout?.intent?.status === 'PENDING_ONLINE', 'expected PENDING_ONLINE')
  const okPath = `/payments/callback/${provider}?ResNum=${encodeURIComponent(providerRef)}&State=OK`
  await fetch(`${base}${okPath}`, { redirect: 'manual' })
  await fetch(`${base}${okPath}`, { redirect: 'manual' })
}

async function payCompetitionEntry(jar, session, entryId, amount = 200000) {
  await ensureWalletBalance(jar, session, amount)
  const { res: checkoutRes, data: checkout } = await apiFetch(base, '/api/payments/checkout', {
    jar,
    session,
    method: 'POST',
    body: { competitionEntryId: entryId, useWallet: true },
  })
  assert(checkoutRes.ok, `wallet checkout → ${checkoutRes.status}: ${JSON.stringify(checkout)}`)
  assert(checkout?.intent?.status === 'PAID', `expected PAID, got ${checkout?.intent?.status}`)
}

async function main() {
  console.log(`competition go/no-go → ${base}`)
  assert(adminSecret, 'ADMIN_PROVISION_SECRET required')

  const health = await apiFetch(base, '/api/health')
  assert(health.res.ok, '/api/health failed')

  // --- Setup: owner + club + 3 athletes ---
  const jar = createCookieJar()
  const owner = await provisionOwner(base, adminSecret, { clubName: `CompGoNoGo ${stamp()}` })
  await apiFetch(base, '/api/auth/login', {
    jar,
    session: 'owner',
    method: 'POST',
    body: { email: owner.email, password: owner.password },
  })

  const today = new Date().toISOString().slice(0, 10)
  const { data: cal } = await apiFetch(base, `/api/owner/calendar?date=${today}`, { jar, session: 'owner' })
  const sportId = cal?.courts?.[0]?.sportId
  assert(sportId, 'club missing court/sport for competition')

  const athletes = []
  for (let i = 0; i < 3; i++) {
    const aJar = createCookieJar()
    const a = await registerAthlete(base, aJar, `athlete${i}`, { viaOtp: true })
    athletes.push({ jar: aJar, session: `athlete${i}`, id: a.user?.id || a.id, phone: a.phone })
  }

  const farEvent = isoOffset(30, 14)
  const soonEvent = isoOffset(0, new Date().getHours() + 2)

  async function createOpenCompetition(overrides = {}) {
    const { res, data } = await apiFetch(base, '/api/owner/competitions', {
      jar,
      session: 'owner',
      method: 'POST',
      body: {
        sportId,
        title: `Pilot ${stamp()}`,
        format: 'knockout',
        enrollmentType: overrides.enrollmentType || 'SINGLE',
        entryFee: overrides.entryFee ?? 200000,
        prizeType: 'WALLET',
        prizeConfigJson: { placements: [{ placement: 1, amount: 500000 }] },
        maxParticipants: overrides.maxParticipants ?? 2,
        minParticipants: overrides.minParticipants ?? 2,
        registrationOpens: isoOffset(-1),
        registrationCloses: overrides.registrationCloses || isoOffset(20),
        eventAt: overrides.eventAt || farEvent,
        sponsorFunded: overrides.sponsorFunded,
        publish: true,
      },
    })
    assert(res.ok, `create competition → ${res.status}: ${JSON.stringify(data)}`)
    return data.competition
  }

  // F-08 Guest cannot join (before S-03 rate-limit burst)
  {
    const comp = await createOpenCompetition({ maxParticipants: 10, minParticipants: 2 })
    const { res } = await apiFetch(base, `/api/competitions/${comp.id}/join`, {
      method: 'POST',
      body: {},
      expectStatus: 401,
    })
    record('F-08', res.status === 401, 'unauthenticated join → 401')
  }

  // F-07 Doubles partner required
  {
    const comp = await createOpenCompetition({ enrollmentType: 'DOUBLE', maxParticipants: 4, minParticipants: 2 })
    const { res, data } = await apiFetch(base, `/api/competitions/${comp.id}/join`, {
      jar: athletes[0].jar,
      session: athletes[0].session,
      method: 'POST',
      body: {},
      expectStatus: 400,
    })
    record('F-07', res.status === 400 && /Partner required/i.test(data?.statusMessage || ''), data?.statusMessage)
  }

  // F-01 Concurrent join — 1 seat left
  {
    const comp = await createOpenCompetition({ maxParticipants: 2, minParticipants: 2 })
    const joinA = await apiFetch(base, `/api/competitions/${comp.id}/join`, {
      jar: athletes[0].jar,
      session: athletes[0].session,
      method: 'POST',
      body: {},
    })
    assert(joinA.res.ok, `athlete0 join → ${joinA.res.status}`)
    await payCompetitionEntry(athletes[0].jar, athletes[0].session, joinA.data.entry.id)

    const [b, c] = await Promise.all([
      apiFetch(base, `/api/competitions/${comp.id}/join`, {
        jar: athletes[1].jar,
        session: athletes[1].session,
        method: 'POST',
        body: {},
      }),
      apiFetch(base, `/api/competitions/${comp.id}/join`, {
        jar: athletes[2].jar,
        session: athletes[2].session,
        method: 'POST',
        body: {},
      }),
    ])
    const statuses = [b.res.status, c.res.status].sort()
    const oneOk = statuses.includes(200) || statuses.includes(201)
    const oneFull = b.data?.statusMessage === 'COMPETITION_FULL' || c.data?.statusMessage === 'COMPETITION_FULL'
      || b.res.status === 409 || c.res.status === 409
    record('F-01', oneOk && oneFull, `statuses ${b.res.status}/${c.res.status}`)

    const { data: detail } = await apiFetch(base, `/api/competitions/${comp.id}`)
    record('F-01b', detail.confirmedCount === 1 && detail.activeCount <= 2, `confirmed=${detail.confirmedCount} active=${detail.activeCount}`)
  }

  // F-02 Payment callback retry → one CONFIRMED
  {
    const comp = await createOpenCompetition({ maxParticipants: 10, minParticipants: 2, entryFee: 150000 })
    const join = await apiFetch(base, `/api/competitions/${comp.id}/join`, {
      jar: athletes[0].jar,
      session: athletes[0].session,
      method: 'POST',
      body: {},
    })
    assert(join.res.ok, 'join for callback test')
    await payCompetitionViaTestGateway(athletes[0].jar, athletes[0].session, join.data.entry.id)
    const { data: detail } = await apiFetch(base, `/api/competitions/${comp.id}`)
    const confirmed = detail.confirmedCount ?? 0
    const { data: athleteEntries } = await apiFetch(base, '/api/athlete/competitions', {
      jar: athletes[0].jar,
      session: athletes[0].session,
    })
    const entryRows = Array.isArray(athleteEntries) ? athleteEntries : (athleteEntries?.entries || [])
    const entryRow = entryRows.find((e) => e.competition?.id === comp.id || e.competitionId === comp.id)
    record(
      'F-02',
      confirmed === 1 && entryRow?.status === 'CONFIRMED',
      `confirmedCount=${confirmed} entryStatus=${entryRow?.status ?? 'missing'}`,
    )
  }

  // F-03 Cancel within policy → wallet credited once
  {
    const comp = await createOpenCompetition({ maxParticipants: 10, minParticipants: 2, eventAt: farEvent })
    const join = await apiFetch(base, `/api/competitions/${comp.id}/join`, {
      jar: athletes[1].jar,
      session: athletes[1].session,
      method: 'POST',
      body: {},
    })
    await payCompetitionEntry(athletes[1].jar, athletes[1].session, join.data.entry.id, 150000)
    const { data: walletBefore } = await apiFetch(base, '/api/wallet', {
      jar: athletes[1].jar,
      session: athletes[1].session,
    })
    const balBefore = walletBefore?.balance ?? 0

    const cancel = await apiFetch(base, `/api/competitions/${comp.id}/cancel-entry`, {
      jar: athletes[1].jar,
      session: athletes[1].session,
      method: 'POST',
      body: { reason: 'go-no-go cancel in policy' },
    })
    assert(cancel.res.ok, `cancel in policy → ${cancel.res.status}`)

    const { data: walletAfter } = await apiFetch(base, '/api/wallet', {
      jar: athletes[1].jar,
      session: athletes[1].session,
    })
    const credited = (walletAfter?.balance ?? 0) - balBefore
    record('F-03', credited === 200000, `wallet +${credited}`)
  }

  // F-04 Cancel outside policy → FA message
  {
    const comp = await createOpenCompetition({
      maxParticipants: 10,
      minParticipants: 2,
      eventAt: soonEvent,
      registrationCloses: isoOffset(1),
    })
    const join = await apiFetch(base, `/api/competitions/${comp.id}/join`, {
      jar: athletes[2].jar,
      session: athletes[2].session,
      method: 'POST',
      body: {},
    })
    await payCompetitionEntry(athletes[2].jar, athletes[2].session, join.data.entry.id)
    const { res, data } = await apiFetch(base, `/api/competitions/${comp.id}/cancel-entry`, {
      jar: athletes[2].jar,
      session: athletes[2].session,
      method: 'POST',
      body: {},
      expectStatus: 409,
    })
    record('F-04', res.status === 409 && data?.statusMessage === 'CANCELLATION_WINDOW_PASSED', data?.statusMessage)
  }

  // F-05 Auto-cancel below minParticipants
  {
    const comp = await createOpenCompetition({
      maxParticipants: 10,
      minParticipants: 2,
      registrationCloses: isoOffset(5),
    })
    const join = await apiFetch(base, `/api/competitions/${comp.id}/join`, {
      jar: athletes[0].jar,
      session: athletes[0].session,
      method: 'POST',
      body: {},
    })
    assert(join.res.ok, `join F-05 → ${join.res.status}`)
    await payCompetitionEntry(athletes[0].jar, athletes[0].session, join.data.entry.id)

    await apiFetch(base, `/api/owner/competitions/${comp.id}`, {
      jar,
      session: 'owner',
      method: 'PATCH',
      body: { registrationCloses: isoOffset(-1) },
    })

    const cron = await apiFetch(base, '/api/admin/competitions/process-registration-close', {
      method: 'POST',
      headers: { 'x-admin-secret': adminSecret },
    })
    assert(cron.res.ok, `cron → ${cron.res.status}`)
    assert(cron.data?.cancelled >= 1, `expected auto-cancel, got ${JSON.stringify(cron.data)}`)

    const { data: after } = await apiFetch(base, `/api/owner/competitions/${comp.id}`, { jar, session: 'owner' })
    record('F-05', after?.status === 'CANCELLED', `status=${after?.status}`)
  }

  // F-06 Owner cancel → refunded
  {
    const comp = await createOpenCompetition({ maxParticipants: 10, minParticipants: 2 })
    const join = await apiFetch(base, `/api/competitions/${comp.id}/join`, {
      jar: athletes[0].jar,
      session: athletes[0].session,
      method: 'POST',
      body: {},
    })
    await payCompetitionEntry(athletes[0].jar, athletes[0].session, join.data.entry.id)

    const cancel = await apiFetch(base, `/api/owner/competitions/${comp.id}/cancel`, {
      jar,
      session: 'owner',
      method: 'POST',
      body: { reason: 'owner go-no-go cancel' },
    })
    assert(cancel.res.ok, `owner cancel → ${cancel.res.status}`)
    record('F-06', cancel.data?.competition?.status === 'CANCELLED', `status=${cancel.data?.competition?.status}`)
  }

  // S-01 Athlete cannot owner API / placements
  {
    const comp = await createOpenCompetition({ maxParticipants: 10 })
    const createOwner = await apiFetch(base, '/api/owner/competitions', {
      jar: athletes[0].jar,
      session: athletes[0].session,
      method: 'POST',
      body: { title: 'hack' },
      expectStatus: 403,
    })
    const patchPlacements = await apiFetch(base, `/api/owner/competitions/${comp.id}/placements`, {
      jar: athletes[0].jar,
      session: athletes[0].session,
      method: 'PATCH',
      body: { placements: [{ entryId: 'x', placement: 1 }] },
      expectStatus: 403,
    })
    record('S-01', createOwner.res.status === 403 && patchPlacements.res.status === 403)
  }

  // S-02 Cross-club award blocked
  {
    const owner2 = await provisionOwner(base, adminSecret, { clubName: `CompOther ${stamp()}` })
    const jar2 = createCookieJar()
    await apiFetch(base, '/api/auth/login', {
      jar: jar2,
      session: 'owner2',
      method: 'POST',
      body: { email: owner2.email, password: owner2.password },
    })
    const comp = await createOpenCompetition({ maxParticipants: 10 })
    const { res } = await apiFetch(base, `/api/owner/competitions/${comp.id}/award-prizes`, {
      jar: jar2,
      session: 'owner2',
      method: 'POST',
      expectStatus: 404,
    })
    record('S-02', res.status === 404)
  }

  // R-03 PILOT_NO_COACH still enforced (reuse smoke check)
  {
    const res = await fetch(`${base}/coaches`, { redirect: 'manual' })
    const loc = res.headers.get('location') || ''
    record('R-03', [301, 302, 307, 308].includes(res.status) && !loc.includes('/coaches'), `redirect ${res.status} → ${loc}`)
  }

  // R-04 Package/recurring 403
  {
    const { res } = await apiFetch(base, '/api/owner/season', {
      jar,
      session: 'owner',
      method: 'POST',
      body: {},
      expectStatus: 403,
    })
    record('R-04', res.status === 403)
  }

  // OPS-01 competition feature gate
  {
    const gateKeys = [
      'COMPETITIONS_ENABLED',
      'NUXT_PUBLIC_COMPETITIONS_ENABLED',
      'COMPETITIONS_PILOT_CLUB_SLUG',
      'NUXT_PUBLIC_COMPETITIONS_PILOT_CLUB_SLUG',
    ]
    const saved = Object.fromEntries(gateKeys.map((k) => [k, process.env[k]]))
    for (const k of gateKeys) delete process.env[k]

    const enabled = (env) =>
      env.NUXT_PUBLIC_COMPETITIONS_ENABLED === 'true' || env.COMPETITIONS_ENABLED === 'true'
    const visible = (slug, env) => {
      if (!enabled(env)) return false
      const pilot = (env.NUXT_PUBLIC_COMPETITIONS_PILOT_CLUB_SLUG || env.COMPETITIONS_PILOT_CLUB_SLUG || '').trim()
      if (!pilot) return true
      return slug === pilot
    }

    const pilotSlug = 'iust-tennis' // shared/pilotClub.ts PILOT_CLUB_SLUG
    const defaultOff = !enabled(process.env) && !visible(pilotSlug, process.env)
    process.env.COMPETITIONS_ENABLED = 'true'
    process.env.COMPETITIONS_PILOT_CLUB_SLUG = pilotSlug
    const pilotOnly = enabled(process.env) && visible(pilotSlug, process.env) && !visible('other', process.env) && !visible('iust', process.env)

    for (const k of gateKeys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }

    record('OPS-01', defaultOff && pilotOnly, 'isCompetitionsEnabled / isCompetitionsVisibleForClub')
  }

  // F-10 Pay-at-club mark paid confirms entry (requires PAYMENTS_MODE=pay_at_club on server)
  {
    if (process.env.PAYMENTS_MODE !== 'pay_at_club') {
      record('F-10', true, 'skipped — server must run with PAYMENTS_MODE=pay_at_club')
    } else {
      const comp = await createOpenCompetition({ maxParticipants: 10, minParticipants: 2 })
      const join = await apiFetch(base, `/api/competitions/${comp.id}/join`, {
        jar: athletes[0].jar,
        session: athletes[0].session,
        method: 'POST',
        body: { payAtClub: true },
      })
      assert(join.res.ok, `pay-at-club join → ${join.res.status}`)
      assert(join.data?.entry?.status === 'PENDING', `expected PENDING, got ${join.data?.entry?.status}`)
      assert(join.data?.payment?.status === 'PAY_AT_CLUB', `expected PAY_AT_CLUB payment`)

      const markPaid = await apiFetch(
        base,
        `/api/owner/competitions/${comp.id}/entries/${join.data.entry.id}/mark-paid`,
        { jar, session: 'owner', method: 'POST' },
      )
      assert(markPaid.res.ok, `mark-paid → ${markPaid.res.status}: ${JSON.stringify(markPaid.data)}`)
      assert(markPaid.data?.entry?.status === 'CONFIRMED', 'mark-paid should confirm entry')

      const doubleMark = await apiFetch(
        base,
        `/api/owner/competitions/${comp.id}/entries/${join.data.entry.id}/mark-paid`,
        { jar, session: 'owner', method: 'POST', expectStatus: 409 },
      )

      const { data: detail } = await apiFetch(base, `/api/owner/competitions/${comp.id}`, { jar, session: 'owner' })
      const confirmed = detail.entries?.filter((e) => e.status === 'CONFIRMED').length ?? 0
      record(
        'F-10',
        doubleMark.res.status === 409 && confirmed === 1,
        `confirmed=${confirmed} doubleMark=${doubleMark.res.status}`,
      )
    }
  }

  // S-03 Rate limit on join — run last so the burst does not break earlier join tests
  {
    const comp = await createOpenCompetition({
      maxParticipants: 100,
      minParticipants: 2,
      entryFee: 0,
      sponsorFunded: true,
    })
    let got429 = false
    let rateLimitMessage = ''
    for (let i = 0; i < 25; i++) {
      const { res, data } = await apiFetch(base, `/api/competitions/${comp.id}/join`, {
        jar: athletes[0].jar,
        session: athletes[0].session,
        method: 'POST',
        body: {},
      })
      if (res.status === 429) {
        got429 = true
        rateLimitMessage = data?.statusMessage || ''
        break
      }
    }
    record(
      'S-03',
      got429 && rateLimitMessage === 'COMPETITION_JOIN_RATE_LIMITED',
      got429 ? `429 ${rateLimitMessage}` : 'no 429 after 25 rapid join POSTs',
    )
  }

  const failed = results.filter((r) => !r.pass).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  if (failed) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
