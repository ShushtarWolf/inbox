/**
 * Real-Postgres integration for the diff-based owner season edit.
 *
 *   MONEY_IT_DATABASE_URL="postgresql://…/inbox?schema=wallet_it" npm run test:money
 */
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { createError } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { addDaysToIsoDate, todayDateString } from '#shared/localDate.ts'
import { resolveMoneyItDatabaseUrl } from './moneyItEnv'

const url = resolveMoneyItDatabaseUrl()
const suite = url ? describe : describe.skip

process.env.DATABASE_URL = url || process.env.DATABASE_URL
process.env.PAYMENTS_MODE = 'test'
process.env.SMS_PROVIDER = 'log'
process.env.PLATFORM_COMMISSION_BPS = '1000'

const db = new PrismaClient({ datasourceUrl: url })
vi.stubGlobal('prisma', db)
vi.stubGlobal('createError', createError)
vi.stubGlobal('todayDateStr', () => todayDateString())

let edit: typeof import('./seasonEdit')

const day = addDaysToIsoDate(todayDateString(), 7)
const PRICE = 400_000

type Method = 'IPG' | 'CASH'

async function fixtures() {
  const tag = randomUUID().slice(0, 8)
  const sport = await db.sport.create({ data: { slug: `padel-${tag}`, nameFa: 'پدل', nameEn: 'Padel', icon: 'sports' } })
  const owner = await db.user.create({ data: { email: `owner-${tag}@it.local`, name: 'Owner', role: 'CLUB_ADMIN' } })
  const athlete = await db.user.create({ data: { email: `ath-${tag}@it.local`, name: 'Athlete' } })
  const other = await db.user.create({ data: { email: `other-${tag}@it.local`, name: 'Other' } })
  const club = await db.club.create({
    data: {
      slug: `club-${tag}`, nameFa: 'باشگاه', nameEn: 'Club', addressFa: 'تهران', addressEn: 'Tehran', city: 'Tehran',
      ownerId: owner.id, sheba: 'IR820540102680020817909002', openHour: 8, closeHour: 23,
    },
  })
  const court = await db.court.create({ data: { nameFa: 'زمین ۱', nameEn: 'Court 1', clubId: club.id, sportId: sport.id } })
  return { tag, owner, athlete, other, club, court }
}
type F = Awaited<ReturnType<typeof fixtures>>

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

async function bookHour(f: F, hour: number, opts: { method: Method; userId: string | null; seasonId?: string }) {
  const slot = await db.slot.create({
    data: { courtId: f.court.id, date: day, startTime: hh(hour), endTime: hh(hour + 1), price: PRICE, displayStatus: 'RESERVED' },
  })
  const meta = opts.seasonId ? JSON.stringify({ sessionPrice: PRICE, seasonBookingId: opts.seasonId }) : null
  const booking = await db.booking.create({
    data: {
      slotId: slot.id,
      userId: opts.userId,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      paymentMethod: opts.method,
      ...(opts.seasonId ? { source: 'CLUB' as const, guestName: 'Ali', guestFamily: 'Ahmadi' } : {}),
    },
  })
  await db.payment.create({
    data: {
      bookingId: booking.id,
      amount: PRICE,
      method: opts.method,
      status: 'PAID',
      provider: opts.method === 'IPG' ? 'sep' : 'pay_at_club',
      ...(opts.method === 'IPG' ? { gatewayRef: `it-ref-${booking.id}` } : {}),
      metadataJson: meta,
    },
  })
  if (opts.seasonId) {
    await db.reservationEvent.create({
      data: { type: 'CREATED', bookingId: booking.id, metadataJson: JSON.stringify({ source: 'owner-recurring', seasonBookingId: opts.seasonId }) },
    })
  }
  return booking
}

/** Season with one booking per hour on `day` / court 1. */
async function season(f: F, hours: number[], method: Method) {
  const s = await db.seasonBooking.create({
    data: {
      clubId: f.club.id, guestName: 'Ali', guestFamily: 'Ahmadi', guestMobile: '', daysJson: '[]',
      timesJson: JSON.stringify(hours.map((h) => ({ date: day, startTime: hh(h), courtId: f.court.id }))),
      startDate: day, finishDate: day,
    },
  })
  const bookings = []
  for (const h of hours) bookings.push(await bookHour(f, h, { method, userId: method === 'IPG' ? f.athlete.id : null, seasonId: s.id }))
  return { season: s, bookings }
}

function units(f: F, hours: number[]) {
  return hours.map((h) => ({ date: day, startTime: hh(h), courtId: f.court.id }))
}

function apply(f: F, seasonId: string, sessions: ReturnType<typeof units>, method: Method = 'CASH') {
  return edit.applySeasonEdit({
    clubId: f.club.id,
    seasonBookingId: seasonId,
    sessions,
    guestName: 'Ali',
    guestFamily: 'Ahmadi',
    guestMobile: '',
    comments: null,
    startDate: day,
    finishDate: day,
    paymentMethod: method,
    paymentStatus: 'PAY_AT_CLUB',
  })
}

async function snapshot(f: F, seasonId: string) {
  const [bookings, payments, walletTxs, clubTxs, events, seasonRow] = await Promise.all([
    db.booking.findMany({ where: { slot: { court: { clubId: f.club.id } } }, orderBy: { id: 'asc' } }),
    db.payment.findMany({ where: { booking: { slot: { court: { clubId: f.club.id } } } }, orderBy: { id: 'asc' } }),
    db.walletTransaction.count(),
    db.clubWalletTransaction.count(),
    db.reservationEvent.count({ where: { booking: { slot: { court: { clubId: f.club.id } } } } }),
    db.seasonBooking.findUniqueOrThrow({ where: { id: seasonId } }),
  ])
  return { bookings, payments, walletTxs, clubTxs, events, seasonRow }
}

async function activeHours(f: F) {
  const rows = await db.booking.findMany({
    where: { status: { not: 'CANCELLED' }, slot: { courtId: f.court.id, date: day } },
    include: { slot: true },
  })
  return rows.map((r) => r.slot.startTime).sort()
}

async function athleteRefunds(userId: string) {
  const wallet = await db.wallet.findUnique({ where: { userId }, include: { transactions: true } })
  return wallet?.transactions.filter((t) => t.amount > 0) || []
}

suite('season edit diff (real Postgres)', () => {
  beforeAll(async () => {
    await db.platformCommissionSetting.upsert({
      where: { id: 'default' }, create: { id: 'default', commissionBps: 1000 }, update: { commissionBps: 1000 },
    })
    const { invalidatePlatformCommissionCache } = await import('./platformCommission.ts')
    invalidatePlatformCommissionCache()
    edit = await import('./seasonEdit')
  })
  afterAll(async () => {
    await db.$disconnect()
  })

  it('unchanged edit writes nothing', async () => {
    const f = await fixtures()
    const { season: s } = await season(f, [18, 19], 'IPG')
    const before = await snapshot(f, s.id)
    const res = await apply(f, s.id, units(f, [18, 19]))
    expect(res).toMatchObject({ unchanged: 2, added: 0, removed: 0, changed: false, refundTotal: 0 })
    expect(await snapshot(f, s.id)).toEqual(before)
  })

  it('adding an hour creates only that booking; kept bookings untouched', async () => {
    const f = await fixtures()
    const { season: s, bookings } = await season(f, [18, 19], 'IPG')
    const before = await snapshot(f, s.id)
    const res = await apply(f, s.id, units(f, [18, 19, 20]))
    expect(res).toMatchObject({ unchanged: 2, added: 1, removed: 0, refundTotal: 0 })
    expect(await activeHours(f)).toEqual(['18:00', '19:00', '20:00'])
    const after = await snapshot(f, s.id)
    for (const b of bookings) {
      expect(after.bookings.find((x) => x.id === b.id)).toEqual(before.bookings.find((x) => x.id === b.id))
    }
    expect(after.walletTxs).toBe(before.walletTxs)
    const added = await db.booking.findUniqueOrThrow({ where: { id: res.addedBookingIds[0]! }, include: { payment: true } })
    expect(added.payment?.metadataJson).toContain(s.id)
    expect(added.paymentStatus).toBe('PAY_AT_CLUB')
    expect(JSON.parse(after.seasonRow.timesJson)).toHaveLength(3)
    // Retry of the same edit is a no-op.
    const again = await apply(f, s.id, units(f, [18, 19, 20]))
    expect(again).toMatchObject({ unchanged: 3, added: 0, removed: 0, changed: false })
    expect(await activeHours(f)).toEqual(['18:00', '19:00', '20:00'])
  })

  it('removing an online-paid hour refunds the athlete wallet once (retry is a no-op)', async () => {
    const f = await fixtures()
    const { season: s, bookings } = await season(f, [18, 19], 'IPG')
    const res = await apply(f, s.id, units(f, [18]))
    expect(res).toMatchObject({ unchanged: 1, added: 0, removed: 1 })
    expect(res.refundTotal).toBe(PRICE)
    expect(await activeHours(f)).toEqual(['18:00'])
    const kept = await db.booking.findUniqueOrThrow({ where: { id: bookings[0]!.id } })
    expect(kept.status).toBe('CONFIRMED')
    const refunds = await athleteRefunds(f.athlete.id)
    expect(refunds).toHaveLength(1)
    expect(refunds[0]!.amount).toBe(PRICE)

    const again = await apply(f, s.id, units(f, [18]))
    expect(again).toMatchObject({ removed: 0, refundTotal: 0, changed: false })
    expect(await athleteRefunds(f.athlete.id)).toHaveLength(1)
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(wallet.balance).toBe(PRICE)
  })

  it('overlapping form rows (18–20 and 19–21) book 19–20 only once', async () => {
    const f = await fixtures()
    const { season: s } = await season(f, [18], 'CASH')
    const res = await apply(f, s.id, [...units(f, [18, 19]), ...units(f, [19, 20])])
    expect(res).toMatchObject({ unchanged: 1, added: 2, removed: 0 })
    expect(await activeHours(f)).toEqual(['18:00', '19:00', '20:00'])
    expect(res.addedRanges).toEqual([{ date: day, courtId: f.court.id, startTime: '19:00', endTime: '21:00', hours: 2 }])
  })

  it("rejects the whole edit when an added hour hits another customer's booking", async () => {
    const f = await fixtures()
    const { season: s } = await season(f, [18, 19], 'IPG')
    await bookHour(f, 20, { method: 'IPG', userId: f.other.id })
    const before = await snapshot(f, s.id)
    // Also removes 18:00 — must not happen because the add conflicts.
    await expect(apply(f, s.id, units(f, [19, 20]))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'SEASON_EDIT_CONFLICT',
    })
    expect(await snapshot(f, s.id)).toEqual(before)
    expect(await athleteRefunds(f.athlete.id)).toHaveLength(0)
  })

  it('removing a cash hour creates no wallet entry', async () => {
    const f = await fixtures()
    const { season: s, bookings } = await season(f, [18, 19], 'CASH')
    const before = await snapshot(f, s.id)
    const res = await apply(f, s.id, units(f, [18]))
    expect(res).toMatchObject({ unchanged: 1, removed: 1 })
    expect(res.refundTotal).toBe(0)
    expect(res.cashReturnTotal).toBe(PRICE)
    const after = await snapshot(f, s.id)
    expect(after.walletTxs).toBe(before.walletTxs)
    expect(await db.wallet.count({ where: { user: { email: { contains: f.tag } } } })).toBe(0)
    const removed = await db.booking.findUniqueOrThrow({ where: { id: bookings[1]!.id } })
    expect(removed.status).toBe('CANCELLED')
  })
})

// ── Multi-week season with a start in the past (Eli's case: shorten / extend the end). ──
const TODAY = todayDateString()
const PAST = addDaysToIsoDate(TODAY, -7)
const W1 = addDaysToIsoDate(TODAY, 7)
const W2 = addDaysToIsoDate(TODAY, 14)
const W3 = addDaysToIsoDate(TODAY, 21)
const W4 = addDaysToIsoDate(TODAY, 28)

async function bookOn(f: F, date: string, opts: { method: Method; userId: string | null; seasonId?: string }) {
  const slot = await db.slot.create({
    data: { courtId: f.court.id, date, startTime: '18:00', endTime: '19:00', price: PRICE, displayStatus: 'RESERVED' },
  })
  const booking = await db.booking.create({
    data: {
      slotId: slot.id, userId: opts.userId, status: 'CONFIRMED', paymentStatus: 'PAID', paymentMethod: opts.method,
      ...(opts.seasonId ? { source: 'CLUB' as const, guestName: 'Ali', guestFamily: 'Ahmadi' } : {}),
    },
  })
  await db.payment.create({
    data: {
      bookingId: booking.id, amount: PRICE, method: opts.method, status: 'PAID',
      provider: opts.method === 'IPG' ? 'sep' : 'pay_at_club',
      ...(opts.method === 'IPG' ? { gatewayRef: `it-ref-${booking.id}` } : {}),
      metadataJson: opts.seasonId ? JSON.stringify({ sessionPrice: PRICE, seasonBookingId: opts.seasonId }) : null,
    },
  })
  if (opts.seasonId) {
    await db.reservationEvent.create({
      data: { type: 'CREATED', bookingId: booking.id, metadataJson: JSON.stringify({ source: 'owner-recurring', seasonBookingId: opts.seasonId }) },
    })
  }
  return booking
}

/** Weekly 18:00 season: one past week + three future weeks; stored start in the past. */
async function weeklySeason(f: F, method: Method) {
  const dates = [PAST, W1, W2, W3]
  const s = await db.seasonBooking.create({
    data: {
      clubId: f.club.id, guestName: 'Ali', guestFamily: 'Ahmadi', guestMobile: '', daysJson: '[]',
      timesJson: JSON.stringify(dates.map((date) => ({ date, startTime: '18:00', courtId: f.court.id }))),
      startDate: PAST, finishDate: W3,
    },
  })
  const bookings = new Map<string, { id: string }>()
  for (const date of dates) {
    bookings.set(date, await bookOn(f, date, { method, userId: method === 'IPG' ? f.athlete.id : null, seasonId: s.id }))
  }
  return { season: s, bookings }
}

const at18 = (f: F, dates: string[]) => dates.map((date) => ({ date, startTime: '18:00', courtId: f.court.id }))

function editDates(f: F, seasonId: string, sessions: ReturnType<typeof at18>, startDate: string, finishDate: string) {
  return edit.applySeasonEdit({
    clubId: f.club.id, seasonBookingId: seasonId, sessions,
    guestName: 'Ali', guestFamily: 'Ahmadi', guestMobile: '', comments: null,
    startDate, finishDate, paymentMethod: 'CASH', paymentStatus: 'PAY_AT_CLUB',
  })
}

async function activeDates(f: F) {
  const rows = await db.booking.findMany({
    where: { status: { not: 'CANCELLED' }, slot: { courtId: f.court.id } },
    include: { slot: true },
  })
  return rows.map((r) => r.slot.date).sort()
}

suite('season edit: change end with a past start (real Postgres)', () => {
  beforeAll(async () => {
    edit = await import('./seasonEdit')
  })

  it('shortening the end keeps the past start, cancels later online-paid weeks with one wallet refund each', async () => {
    const f = await fixtures()
    const { season: s, bookings } = await weeklySeason(f, 'IPG')
    const pastBefore = await db.booking.findUniqueOrThrow({ where: { id: bookings.get(PAST)!.id }, include: { payment: true } })
    // Preview sends only future occurrences (past = PAST conflict), new end = W1 + 2 days.
    const newEnd = addDaysToIsoDate(W1, 2)
    const res = await editDates(f, s.id, at18(f, [W1]), PAST, newEnd)
    expect(res).toMatchObject({ unchanged: 1, added: 0, removed: 2, keptPast: 1 })
    expect(res.refundTotal).toBe(2 * PRICE)
    expect(res.cashReturnTotal).toBe(0)
    expect(await activeDates(f)).toEqual([PAST, W1])
    expect(await db.booking.findUniqueOrThrow({ where: { id: bookings.get(PAST)!.id }, include: { payment: true } })).toEqual(pastBefore)
    const row = await db.seasonBooking.findUniqueOrThrow({ where: { id: s.id } })
    expect(row.startDate).toBe(PAST)
    expect(row.finishDate).toBe(newEnd)
    expect(JSON.parse(row.timesJson).map((u: { date: string }) => u.date).sort()).toEqual([PAST, W1])
    expect(await athleteRefunds(f.athlete.id)).toHaveLength(2)

    // Retry is a no-op: no second refund.
    const again = await editDates(f, s.id, at18(f, [W1]), PAST, newEnd)
    expect(again).toMatchObject({ removed: 0, added: 0, refundTotal: 0, changed: false })
    expect(await athleteRefunds(f.athlete.id)).toHaveLength(2)
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(wallet.balance).toBe(2 * PRICE)
  })

  it('shortening a cash season never touches a wallet (desk cash-return only)', async () => {
    const f = await fixtures()
    const { season: s } = await weeklySeason(f, 'CASH')
    const walletTxBefore = await db.walletTransaction.count()
    const res = await editDates(f, s.id, at18(f, [W1]), PAST, addDaysToIsoDate(W1, 2))
    expect(res).toMatchObject({ removed: 2, keptPast: 1, refundTotal: 0, cashReturnTotal: 2 * PRICE })
    expect(await db.walletTransaction.count()).toBe(walletTxBefore)
    expect(await db.wallet.count({ where: { user: { email: { contains: f.tag } } } })).toBe(0)
    expect(await activeDates(f)).toEqual([PAST, W1])
  })

  it('end moved before the next session (empty desired list) cancels all future weeks, keeps the past', async () => {
    const f = await fixtures()
    const { season: s } = await weeklySeason(f, 'IPG')
    const res = await editDates(f, s.id, [], PAST, TODAY)
    expect(res).toMatchObject({ removed: 3, keptPast: 1, added: 0, refundTotal: 3 * PRICE })
    expect(await activeDates(f)).toEqual([PAST])
    const row = await db.seasonBooking.findUniqueOrThrow({ where: { id: s.id } })
    expect(JSON.parse(row.timesJson)).toEqual([{ date: PAST, startTime: '18:00', courtId: f.court.id }])
    expect(row.finishDate).toBe(TODAY)
  })

  it('extending the end adds only the new week (past and kept weeks untouched)', async () => {
    const f = await fixtures()
    const { season: s, bookings } = await weeklySeason(f, 'IPG')
    const before = await db.booking.findMany({ where: { id: { in: [...bookings.values()].map((b) => b.id) } }, orderBy: { id: 'asc' } })
    const res = await editDates(f, s.id, at18(f, [W1, W2, W3, W4]), PAST, W4)
    expect(res).toMatchObject({ unchanged: 3, added: 1, removed: 0, keptPast: 1, refundTotal: 0 })
    expect(await activeDates(f)).toEqual([PAST, W1, W2, W3, W4])
    const after = await db.booking.findMany({ where: { id: { in: [...bookings.values()].map((b) => b.id) } }, orderBy: { id: 'asc' } })
    expect(after).toEqual(before)
    expect(await athleteRefunds(f.athlete.id)).toHaveLength(0)
  })

  it('extending into a week held by another customer rejects the whole edit', async () => {
    const f = await fixtures()
    const { season: s } = await weeklySeason(f, 'IPG')
    await bookOn(f, W4, { method: 'IPG', userId: f.other.id })
    await expect(editDates(f, s.id, at18(f, [W1, W4]), PAST, W4)).rejects.toMatchObject({ statusCode: 409 })
    expect(await activeDates(f)).toEqual([PAST, W1, W2, W3, W4])
    expect(await athleteRefunds(f.athlete.id)).toHaveLength(0)
  })

  it('rejects moving the start to another past day and a changed end before today; writes nothing', async () => {
    const f = await fixtures()
    const { season: s } = await weeklySeason(f, 'IPG')
    await expect(editDates(f, s.id, at18(f, [W1]), addDaysToIsoDate(PAST, 1), W1))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'SEASON_EDIT_START_IN_PAST' })
    await expect(editDates(f, s.id, [], PAST, addDaysToIsoDate(TODAY, -1)))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'SEASON_EDIT_FINISH_IN_PAST' })
    expect(await activeDates(f)).toEqual([PAST, W1, W2, W3])
    const row = await db.seasonBooking.findUniqueOrThrow({ where: { id: s.id } })
    expect(row).toMatchObject({ startDate: PAST, finishDate: W3 })
  })
})
