/**
 * Real-Postgres money integration: runs the actual wallet / settlement / cancel code
 * against an isolated schema. Never point MONEY_IT_DATABASE_URL at production.
 *
 *   MONEY_IT_DATABASE_URL="postgresql://…/inbox?schema=wallet_it" npm run test:money
 */
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { createError } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { addDaysToIsoDate, todayDateString } from '#shared/localDate.ts'
import { walletBalanceDrift } from '#shared/walletRecon.ts'

const url = process.env.MONEY_IT_DATABASE_URL
if (url && !/schema=wallet_it/.test(url)) {
  throw new Error('MONEY_IT_DATABASE_URL must target the isolated wallet_it schema')
}
const suite = url ? describe : describe.skip

process.env.DATABASE_URL = url || process.env.DATABASE_URL
process.env.PAYMENTS_MODE = 'test'
process.env.SMS_PROVIDER = 'log'
process.env.PLATFORM_COMMISSION_BPS = '1000'

const db = new PrismaClient({ datasourceUrl: url })
vi.stubGlobal('prisma', db)
vi.stubGlobal('createError', createError)
vi.stubGlobal('todayDateStr', () => todayDateString())

type Mods = {
  wallet: typeof import('./wallet')
  settlement: typeof import('./settlement')
  refunds: typeof import('./refunds')
  cancellations: typeof import('./cancellations')
  staleBooking: typeof import('./staleBooking')
  deskCash: typeof import('./deskCashReturn')
}
let m: Mods

const today = todayDateString()
const future = addDaysToIsoDate(today, 5)
const past = addDaysToIsoDate(today, -3)

async function fixtures() {
  const tag = randomUUID().slice(0, 8)
  const sport = await db.sport.create({
    data: { slug: `padel-${tag}`, nameFa: 'پدل', nameEn: 'Padel', icon: 'sports' },
  })
  const owner = await db.user.create({ data: { email: `owner-${tag}@it.local`, name: 'Owner', role: 'CLUB_ADMIN' } })
  const athlete = await db.user.create({ data: { email: `ath-${tag}@it.local`, name: 'Athlete' } })
  const club = await db.club.create({
    data: {
      slug: `club-${tag}`,
      nameFa: 'باشگاه',
      nameEn: 'Club',
      addressFa: 'تهران',
      addressEn: 'Tehran',
      city: 'Tehran',
      ownerId: owner.id,
      sheba: 'IR820540102680020817909002',
    },
  })
  const court = await db.court.create({
    data: { nameFa: 'زمین ۱', nameEn: 'Court 1', clubId: club.id, sportId: sport.id },
  })
  return { tag, sport, owner, athlete, club, court }
}

async function paidBooking(f: Awaited<ReturnType<typeof fixtures>>, opts: {
  date: string
  startTime?: string
  amount: number
  method: 'IPG' | 'CASH' | 'PAID'
  userId?: string | null
}) {
  const startTime = opts.startTime || '18:00'
  const slot = await db.slot.create({
    data: {
      courtId: f.court.id,
      date: opts.date,
      startTime,
      endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, '0')}:00`,
      price: opts.amount,
      displayStatus: 'RESERVED',
    },
  })
  const booking = await db.booking.create({
    data: {
      slotId: slot.id,
      userId: opts.userId === undefined ? f.athlete.id : opts.userId,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      paymentMethod: opts.method,
    },
  })
  const payment = await db.payment.create({
    data: {
      bookingId: booking.id,
      amount: opts.amount,
      method: opts.method,
      status: 'PAID',
      provider: opts.method === 'IPG' ? 'sep' : 'pay_at_club',
    },
  })
  return { slot, booking, payment }
}

async function userDrift(userId: string) {
  const wallet = await db.wallet.findUnique({ where: { userId }, include: { transactions: true } })
  if (!wallet) return 0
  const paid = await db.userWithdrawRequest.aggregate({ where: { userId, status: 'PAID' }, _sum: { amount: true } })
  return walletBalanceDrift({
    storedBalance: wallet.balance,
    txs: wallet.transactions,
    withdrawPaidConsumed: paid._sum.amount || 0,
  })
}

async function clubDrift(clubId: string) {
  const wallet = await db.clubWallet.findUnique({ where: { clubId }, include: { transactions: true } })
  if (!wallet) return 0
  const paid = await db.withdrawRequest.aggregate({ where: { clubId, status: 'PAID' }, _sum: { amount: true } })
  expect(wallet.balance).toBe(wallet.availableBalance + wallet.lockedBalance)
  return walletBalanceDrift({
    storedBalance: wallet.balance,
    txs: wallet.transactions,
    withdrawPaidConsumed: paid._sum.amount || 0,
  })
}

suite('money integration (real Postgres)', () => {
  beforeAll(async () => {
    m = {
      wallet: await import('./wallet'),
      settlement: await import('./settlement'),
      refunds: await import('./refunds'),
      cancellations: await import('./cancellations'),
      staleBooking: await import('./staleBooking'),
      deskCash: await import('./deskCashReturn'),
    }
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('top-up credits once under concurrent callbacks', async () => {
    const f = await fixtures()
    const payment = await db.payment.create({
      data: { amount: 500_000, method: 'IPG', status: 'PAID', provider: 'sep', purpose: 'topup', userId: f.athlete.id },
    })
    await Promise.allSettled([
      m.wallet.creditWalletForTopUpPayment(payment.id, 'PENDING_ONLINE'),
      m.wallet.creditWalletForTopUpPayment(payment.id, 'PENDING_ONLINE'),
      m.wallet.creditWalletForTopUpPayment(payment.id, 'PENDING_ONLINE'),
    ])
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(wallet.balance).toBe(500_000)
    expect(wallet.availableBalance).toBe(500_000)
    expect(await userDrift(f.athlete.id)).toBe(0)
  })

  it('wallet spend debits once under concurrency and rejects overspend', async () => {
    const f = await fixtures()
    await m.wallet.creditWallet(f.athlete.id, 300_000, { type: 'TOPUP_CREDIT', note: 'seed' })
    const payment = await db.payment.create({
      data: { amount: 200_000, method: 'PAID', status: 'PAID', provider: 'pay_at_club' },
    })
    await Promise.allSettled([
      m.wallet.debitWallet(f.athlete.id, 200_000, { type: 'PAYMENT_DEBIT', paymentId: payment.id }),
      m.wallet.debitWallet(f.athlete.id, 200_000, { type: 'PAYMENT_DEBIT', paymentId: payment.id }),
    ])
    let wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(wallet.balance).toBe(100_000)

    await expect(m.wallet.debitWallet(f.athlete.id, 150_000, { type: 'PAYMENT_DEBIT', note: 'too much' }))
      .rejects.toMatchObject({ statusCode: 409 })
    wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(wallet.balance).toBe(100_000)
    expect(wallet.availableBalance).toBeGreaterThanOrEqual(0)
    expect(await userDrift(f.athlete.id)).toBe(0)
  })

  it('IPG booking settles 90% to club (locked until after class), once under concurrency', async () => {
    const f = await fixtures()
    const { payment } = await paidBooking(f, { date: future, amount: 1_000_000, method: 'IPG' })
    await Promise.allSettled([
      m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE'),
      m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE'),
    ])
    const wallet = await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })
    expect(wallet.balance).toBe(900_000)
    expect(wallet.lockedBalance).toBe(900_000)
    expect(wallet.availableBalance).toBe(0)
    expect(await db.settlementLedgerEntry.count({ where: { paymentId: payment.id } })).toBe(1)
    const balances = await m.settlement.getClubWithdrawableBalance(f.club.id)
    expect(balances.withdrawableBalance).toBe(0)
    expect(balances.pendingClassBalance).toBe(900_000)
    expect(await clubDrift(f.club.id)).toBe(0)
  })

  it('desk CASH never enters the club wallet', async () => {
    const f = await fixtures()
    const { payment } = await paidBooking(f, { date: future, amount: 700_000, method: 'CASH' })
    const result = await m.settlement.creditOwnerForPaidPayment(payment.id, 'PAY_AT_CLUB')
    expect(result.reason).toBe('cash_not_settled')
    expect(await db.clubWallet.findUnique({ where: { clubId: f.club.id } })).toBeNull()
  })

  it('owner cancel of IPG booking: athlete wallet +gross, club −net, slot free, ledgers balance', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 1_000_000, method: 'IPG' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')

    await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'owner-cancel',
      paymentId: payment.id,
      userId: f.athlete.id,
      moneyOutcome: 'full_wallet_refund',
    })

    const athleteWallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    const clubWallet = await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })
    expect(athleteWallet.availableBalance).toBe(1_000_000)
    expect(clubWallet.balance).toBe(0)
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('REFUNDED')
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED')
    expect((await db.slot.findUniqueOrThrow({ where: { id: slot.id } })).displayStatus).toBe('FREE')
    expect((await db.settlementLedgerEntry.findUniqueOrThrow({ where: { paymentId: payment.id } })).clawedBackAt).not.toBeNull()
    expect(await userDrift(f.athlete.id)).toBe(0)
    expect(await clubDrift(f.club.id)).toBe(0)

    // Cancel twice must not double-credit.
    await m.refunds.refundPaymentForCancellation({ paymentId: payment.id, userId: f.athlete.id, reason: 'retry' })
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })).balance).toBe(1_000_000)
  })

  it('athlete cancel inside window: no refund, club keeps the net', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 600_000, method: 'IPG' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'athlete-cancel',
      paymentId: payment.id,
      userId: f.athlete.id,
      moneyOutcome: 'zero_refund',
    })
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('PAID')
    expect(await db.wallet.findUnique({ where: { userId: f.athlete.id } })).toBeNull()
    expect((await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })).balance).toBe(540_000)
  })

  it('cancel rolls back entirely when the refund cannot be applied (slot stays booked)', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 400_000, method: 'IPG' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    await expect(m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'owner-cancel',
      paymentId: payment.id,
      // Unknown user → wallet upsert FK fails inside the txn.
      userId: `missing-${f.tag}`,
      moneyOutcome: 'full_wallet_refund',
    })).rejects.toBeTruthy()
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED')
    expect((await db.slot.findUniqueOrThrow({ where: { id: slot.id } })).displayStatus).toBe('RESERVED')
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('PAID')
    expect((await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })).balance).toBe(360_000)
  })

  it('desk cash cancel: no wallet credit, return owed until owner acks', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 500_000, method: 'CASH' })
    const res = await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'owner-cancel',
      paymentId: payment.id,
      userId: f.athlete.id,
      moneyOutcome: 'full_wallet_refund',
    })
    expect(res.refund?.walletCredited).toBe(false)
    expect(res.refund?.deskCashReturn).toBe('owed')
    expect(await db.wallet.findUnique({ where: { userId: f.athlete.id } })).toBeNull()
    await m.deskCash.acknowledgeDeskCashReturn({ paymentId: payment.id, clubId: f.club.id })
    const meta = JSON.parse((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).metadataJson || '{}')
    expect(meta.deskCashReturn).toBe('returned')
  })

  it('pay-link guest (no wallet) IPG cancel is flagged for manual bank refund', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 300_000, method: 'IPG', userId: null })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'owner-cancel',
      paymentId: payment.id,
      userId: null,
      moneyOutcome: 'full_wallet_refund',
    })
    const row = await db.payment.findUniqueOrThrow({ where: { id: payment.id } })
    expect(row.status).toBe('REFUNDED')
    expect(JSON.parse(row.metadataJson || '{}').manualRefundRequired).toBe(true)
    expect((await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })).balance).toBe(0)
  })

  it('re-booking a cancelled slot keeps the old payment (detached, not cascaded)', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 450_000, method: 'IPG' })
    await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'athlete-cancel',
      paymentId: payment.id,
      userId: f.athlete.id,
      moneyOutcome: 'zero_refund',
    })
    await db.$transaction(async (tx) => {
      await m.staleBooking.deleteStaleCancelledBooking(tx, booking.id)
      await tx.booking.create({ data: { slotId: slot.id, status: 'CONFIRMED' } })
    })
    const kept = await db.payment.findUniqueOrThrow({ where: { id: payment.id } })
    expect(kept.bookingId).toBeNull()
    expect(kept.status).toBe('PAID')
    expect(JSON.parse(kept.metadataJson || '{}').detachedClubId).toBe(f.club.id)
  })

  it('club withdraw: only after class, partial series clawback reduces it, paid withdraw balances', async () => {
    const f = await fixtures()
    const { booking, payment } = await paidBooking(f, { date: past, amount: 1_000_000, method: 'IPG' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    let balances = await m.settlement.getClubWithdrawableBalance(f.club.id)
    expect(balances.withdrawableBalance).toBe(900_000)

    await m.settlement.clawbackOwnerPartialForPayment({
      paymentId: payment.id,
      grossRefundAmount: 200_000,
      bookingId: booking.id,
    })
    balances = await m.settlement.getClubWithdrawableBalance(f.club.id)
    expect(balances.withdrawableBalance).toBe(720_000)

    await expect(m.settlement.requestClubWithdraw({ clubId: f.club.id, amount: 800_000, sheba: f.club.sheba }))
      .rejects.toMatchObject({ statusCode: 409 })
    const request = await m.settlement.requestClubWithdraw({ clubId: f.club.id, amount: 720_000, sheba: f.club.sheba })
    balances = await m.settlement.getClubWithdrawableBalance(f.club.id)
    expect(balances.withdrawableBalance).toBe(0)

    await m.settlement.markWithdrawPaid(request.id)
    await m.settlement.markWithdrawPaid(request.id)
    const wallet = await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })
    expect(wallet.balance).toBe(0)
    expect(await clubDrift(f.club.id)).toBe(0)
  })

  it('withdraw reject releases the hold back to available', async () => {
    const f = await fixtures()
    const { payment } = await paidBooking(f, { date: past, amount: 500_000, method: 'PAID' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    const request = await m.settlement.requestClubWithdraw({ clubId: f.club.id, amount: 450_000, sheba: f.club.sheba })
    await m.settlement.rejectWithdrawRequest(request.id)
    const balances = await m.settlement.getClubWithdrawableBalance(f.club.id)
    expect(balances.withdrawableBalance).toBe(450_000)
    expect(await clubDrift(f.club.id)).toBe(0)
  })
})
