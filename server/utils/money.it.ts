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
import { readDeskCashReturn } from '#shared/cancelRefund.ts'
import { walletBalanceDrift } from '#shared/walletRecon.ts'
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
      ...(opts.method === 'IPG'
        ? { gatewayRef: `it-ref-${booking.id}` }
        : {}),
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
    await db.platformCommissionSetting.upsert({
      where: { id: 'default' },
      create: { id: 'default', commissionBps: 1000 },
      update: { commissionBps: 1000 },
    })
    const { invalidatePlatformCommissionCache } = await import('./platformCommission.ts')
    invalidatePlatformCommissionCache()
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

  it('IPG PAID without a verified capture never enters the club wallet', async () => {
    const f = await fixtures()
    const { payment } = await paidBooking(f, { date: future, amount: 700_000, method: 'IPG' })
    await db.payment.update({ where: { id: payment.id }, data: { gatewayRef: null } })
    const result = await m.settlement.creditOwnerForPaidPayment(payment.id, 'PAY_AT_CLUB')
    expect(result.reason).toBe('ipg_unverified')
    expect(await db.clubWallet.findUnique({ where: { clubId: f.club.id } })).toBeNull()
    expect(await db.settlementLedgerEntry.count({ where: { paymentId: payment.id } })).toBe(0)
  })

  it('owner cancel of IPG booking: athlete wallet +gross, club returns its net, slot free, ledgers balance', async () => {
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
    // Club returns the 900k it was credited; platform refunds its own 100k commission.
    expect(clubWallet.balance).toBe(0)
    const ledger = await db.settlementLedgerEntry.findUniqueOrThrow({ where: { paymentId: payment.id } })
    expect(ledger.commissionReversed).toBe(100_000)
    expect(ledger.ownerNet + ledger.commissionReversed).toBe(1_000_000)
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

  it('athlete cancel of IPG booking: wallet credit + club clawback (window no longer zeroes money)', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 600_000, method: 'IPG' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'athlete-cancel',
      paymentId: payment.id,
      userId: f.athlete.id,
      moneyOutcome: 'full_wallet_refund',
    })
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('REFUNDED')
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })).balance).toBe(600_000)
    expect((await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })).balance).toBe(0)
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

  it('desk cash ack still works after cancelled booking detached for re-book', async () => {
    const f = await fixtures()
    const staleBooking = await import('./staleBooking')
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 350_000, method: 'CASH' })
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'REFUNDED',
        metadataJson: JSON.stringify({ refundChannel: 'desk_cash', deskCashReturn: 'owed' }),
      },
    })
    await db.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } })
    await db.$transaction(async (tx) => {
      await staleBooking.deleteStaleCancelledBooking(tx, booking.id)
      await tx.booking.create({ data: { slotId: slot.id, status: 'CONFIRMED' } })
    })
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).bookingId).toBeNull()
    await m.deskCash.acknowledgeDeskCashReturn({ paymentId: payment.id, clubId: f.club.id })
    const after = await db.payment.findUniqueOrThrow({ where: { id: payment.id } })
    expect(readDeskCashReturn(JSON.parse(after.metadataJson || '{}'))).toBe('returned')
  })

  it('pay-link guest with no account does not cancel or refund', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 300_000, method: 'IPG', userId: null })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    await expect(m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'owner-cancel',
      paymentId: payment.id,
      userId: null,
      moneyOutcome: 'full_wallet_refund',
    })).rejects.toMatchObject({ statusMessage: 'REFUND_ACCOUNT_REQUIRED' })
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED')
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('PAID')
    expect((await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })).balance).toBe(270_000)
    expect(await db.wallet.count({ where: { userId: f.athlete.id } })).toBe(0)
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
    // Partial clawback is pro-rata on ownerNet: 900k × 200k / 1M = 180k.
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

  it('withdraw paid then cancel claws club wallet negative', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: past, amount: 500_000, method: 'IPG' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    const request = await m.settlement.requestClubWithdraw({
      clubId: f.club.id,
      amount: 450_000,
      sheba: f.club.sheba,
    })
    await m.settlement.markWithdrawPaid(request.id)
    await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'owner-cancel',
      paymentId: payment.id,
      userId: f.athlete.id,
      moneyOutcome: 'full_wallet_refund',
    })
    const wallet = await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })
    expect(wallet.availableBalance).toBeLessThan(0)
  })

  it('partial inside-window refund credits floor(bps) and claws pro-rata', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 200_000, method: 'IPG' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'athlete-cancel',
      paymentId: payment.id,
      userId: f.athlete.id,
      moneyOutcome: 'partial_wallet_refund',
      refundBps: 5000,
    })
    const athlete = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(athlete.availableBalance).toBe(100_000)
    const club = await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })
    // 180k net credited, half clawed back → 90k; platform refunds half of its 20k commission.
    expect(club.balance).toBe(90_000)
  })

  it('promo club commissionBps=0 settles 100% while the global rate is 10%', async () => {
    const f = await fixtures()
    await db.club.update({ where: { id: f.club.id }, data: { commissionBps: 0 } })
    const { payment } = await paidBooking(f, { date: future, amount: 500_000, method: 'IPG' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    const entry = await db.settlementLedgerEntry.findUniqueOrThrow({ where: { paymentId: payment.id } })
    expect(entry.commissionBps).toBe(0)
    expect(entry.ownerNet).toBe(500_000)
  })

  it('money-jobs worker settles PAID IPG when confirm side-effects were skipped', async () => {
    const f = await fixtures()
    const { payment } = await paidBooking(f, { date: future, amount: 800_000, method: 'IPG' })
    const { reconcilePaidPaymentsMissingLedger } = await import('./moneyJobs')
    await reconcilePaidPaymentsMissingLedger()
    const wallet = await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })
    expect(wallet.balance).toBe(720_000)
    expect(await db.settlementLedgerEntry.count({ where: { paymentId: payment.id } })).toBe(1)
    expect(await db.moneyJob.findFirst({ where: { paymentId: payment.id, status: 'DONE' } })).not.toBeNull()
  })

  it('superseded checkout row stays in DB with chain pointer', async () => {
    const f = await fixtures()
    const old = await db.payment.create({
      data: {
        amount: 100_000,
        method: 'IPG',
        status: 'SUPERSEDED',
        provider: 'sep',
        bookingId: null,
      },
    })
    const { payment: replacement } = await paidBooking(f, { date: future, amount: 100_000, method: 'IPG' })
    await db.payment.update({
      where: { id: old.id },
      data: { supersededByPaymentId: replacement.id },
    })
    const kept = await db.payment.findUniqueOrThrow({ where: { id: old.id } })
    expect(kept.status).toBe('SUPERSEDED')
    expect(kept.supersededByPaymentId).toBe(replacement.id)
  })

  it('series session refund retry moves money once; last session refunds the exact residual', async () => {
    const f = await fixtures()
    const { refundAfterSeriesSessionCancel } = await import('./seriesCancelRefund')
    const primary = await paidBooking(f, { date: future, startTime: '10:00', amount: 900_000, method: 'IPG' })
    const siblings = []
    for (const startTime of ['12:00', '14:00']) {
      const s = await paidBooking(f, { date: future, startTime, amount: 0, method: 'IPG' })
      await db.payment.update({
        where: { id: s.payment.id },
        data: { metadataJson: JSON.stringify({ coveredByBookingId: primary.booking.id, sessionPrice: 300_000 }) },
      })
      siblings.push(s)
    }
    await db.payment.update({
      where: { id: primary.payment.id },
      data: {
        metadataJson: JSON.stringify({
          groupPrimaryBookingId: primary.booking.id,
          groupSiblingBookingIds: siblings.map((s) => s.booking.id),
          sessionPrice: 300_000,
        }),
      },
    })
    await m.settlement.creditOwnerForPaidPayment(primary.payment.id, 'PENDING_ONLINE')

    const cancelSession = async (bookingId: string) => {
      await db.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } })
      return refundAfterSeriesSessionCancel({
        cancelledBookingId: bookingId,
        userId: f.athlete.id,
        reason: 'athlete-cancel',
        moneyOutcome: 'full_wallet_refund',
      })
    }

    await cancelSession(siblings[0]!.booking.id)
    const retry = await cancelSession(siblings[0]!.booking.id)
    expect(retry?.amount).toBe(0)
    let athlete = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(athlete.availableBalance).toBe(300_000)
    const meta = JSON.parse((await db.payment.findUniqueOrThrow({ where: { id: primary.payment.id } })).metadataJson || '{}')
    expect(meta.sessionRefundsTotal).toBe(300_000)

    await cancelSession(siblings[1]!.booking.id)
    await cancelSession(primary.booking.id)
    athlete = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(athlete.availableBalance).toBe(900_000)
    const club = await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })
    expect(club.balance).toBe(0)
    expect((await db.payment.findUniqueOrThrow({ where: { id: primary.payment.id } })).status).toBe('REFUNDED')
    expect(await clubDrift(f.club.id)).toBe(0)
    expect(await userDrift(f.athlete.id)).toBe(0)
  })

  it('cron money audit reports zero drift after a paid withdraw', async () => {
    const f = await fixtures()
    const { payment } = await paidBooking(f, { date: past, amount: 500_000, method: 'IPG' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    const request = await m.settlement.requestClubWithdraw({ clubId: f.club.id, amount: 450_000, sheba: f.club.sheba })
    await m.settlement.markWithdrawPaid(request.id)
    const { runMoneyAudit } = await import('./moneyAudit')
    const summary = await runMoneyAudit()
    expect(summary.clubBalanceDrift).toBe(0)
    expect(summary.userBalanceDrift).toBe(0)
  })

  it('IPG confirm credits then debits the athlete wallet once, including concurrent retries', async () => {
    const f = await fixtures()
    const { payment } = await paidBooking(f, { date: future, amount: 2_500, method: 'IPG' })
    const { applyWalletFirstForConfirmedIpg } = await import('./walletFirstIpg')
    await Promise.allSettled([
      db.$transaction((tx) => applyWalletFirstForConfirmedIpg(tx, payment.id)),
      db.$transaction((tx) => applyWalletFirstForConfirmedIpg(tx, payment.id)),
    ])
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(wallet.balance).toBe(0)
    expect(wallet.availableBalance).toBe(0)
    const txs = await db.walletTransaction.findMany({ where: { paymentId: payment.id }, orderBy: { type: 'asc' } })
    expect(txs.map((tx) => tx.type).sort()).toEqual(['IPG_BOOKING_CREDIT', 'IPG_BOOKING_DEBIT'])
    expect(txs.reduce((sum, tx) => sum + tx.amount, 0)).toBe(0)
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    expect(await db.settlementLedgerEntry.count({ where: { paymentId: payment.id } })).toBe(1)
    expect((await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })).balance).toBe(2_250)
    expect(await userDrift(f.athlete.id)).toBe(0)
    expect(await clubDrift(f.club.id)).toBe(0)
  })

  it('cancel after wallet-first IPG refunds the wallet once and does not withdraw', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await paidBooking(f, { date: future, amount: 2_500, method: 'IPG' })
    const { applyWalletFirstForConfirmedIpg } = await import('./walletFirstIpg')
    await db.$transaction((tx) => applyWalletFirstForConfirmedIpg(tx, payment.id))
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'athlete-cancel',
      paymentId: payment.id,
      userId: f.athlete.id,
      moneyOutcome: 'full_wallet_refund',
    })
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(wallet.balance).toBe(2_500)
    expect(await db.walletTransaction.count({ where: { paymentId: payment.id, type: 'REFUND_CREDIT' } })).toBe(1)
    expect(await db.userWithdrawRequest.count({ where: { userId: f.athlete.id } })).toBe(0)
    expect((await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })).balance).toBe(0)
    await m.refunds.refundPaymentForCancellation({ paymentId: payment.id, userId: f.athlete.id, reason: 'retry' })
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })).balance).toBe(2_500)
  })

  it('guest IPG does not create a wallet, and a top-up is not debited as a booking', async () => {
    const f = await fixtures()
    const { payment } = await paidBooking(f, { date: future, amount: 2_500, method: 'IPG', userId: null })
    const { applyWalletFirstForConfirmedIpg } = await import('./walletFirstIpg')
    const guest = await db.$transaction((tx) => applyWalletFirstForConfirmedIpg(tx, payment.id))
    expect(guest.status).toBe('no_account')
    expect(await db.walletTransaction.count({ where: { paymentId: payment.id } })).toBe(0)
    const meta = JSON.parse((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).metadataJson || '{}')
    expect(meta.walletFirstStatus).toBe('no_account')

    const topup = await db.payment.create({
      data: { amount: 50_000, method: 'IPG', status: 'PAID', provider: 'sep', purpose: 'topup', userId: f.athlete.id },
    })
    await m.wallet.creditWalletForTopUpPayment(topup.id, 'PENDING_ONLINE')
    const skipped = await db.$transaction((tx) => applyWalletFirstForConfirmedIpg(tx, topup.id))
    expect(skipped.status).toBe('topup')
    expect(await db.walletTransaction.count({ where: { paymentId: topup.id, type: 'IPG_BOOKING_DEBIT' } })).toBe(0)
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })).balance).toBe(50_000)
  })

  it('historical card reversal appends a net-zero trail and does not add spendable credit', async () => {
    const f = await fixtures()
    const { booking, payment } = await paidBooking(f, { date: past, amount: 2_500, method: 'IPG' })
    await db.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED', cancelledAt: new Date('2026-08-15T10:00:00.000Z') } })
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'REFUNDED',
        metadataJson: JSON.stringify({
          refundChannel: 'gateway_reverse',
          gatewayReversed: true,
          gatewayRefund: true,
          reversePending: false,
          refundCreditAmount: 0,
          refundedAmount: 0,
        }),
      },
    })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    const { planWalletFirstHistorical } = await import('#shared/walletFirstHistorical.ts')
    const { applyHistoricalWalletFirstPair } = await import('./walletFirstIpg')
    const loaded = await db.payment.findUniqueOrThrow({ where: { id: payment.id } })
    const plan = planWalletFirstHistorical({
      paymentId: loaded.id,
      method: loaded.method,
      provider: loaded.provider,
      purpose: loaded.purpose,
      paymentStatus: loaded.status,
      bookingStatus: 'CANCELLED',
      amount: loaded.amount,
      paymentUserId: f.athlete.id,
      bookingUserId: f.athlete.id,
      metadata: JSON.parse(loaded.metadataJson || '{}'),
      walletTxs: [],
      refundCreditSum: 0,
      unclawedOwnerNet: 0,
    })
    expect(plan.refundCorrection).toMatchObject({ action: 'skip', reason: 'card_already_reversed' })
    expect(plan.reconstruction).toMatchObject({ action: 'pair', debitType: 'IPG_RETURNED_TO_CARD', netWalletToman: 0 })
    if (plan.reconstruction.action !== 'pair') throw new Error('expected pair')
    const original = new Date('2026-08-15T10:00:00.000Z')
    await db.$transaction((tx) => applyHistoricalWalletFirstPair(tx, {
      userId: plan.reconstruction.action === 'pair' ? plan.reconstruction.userId : f.athlete.id,
      paymentId: payment.id,
      bookingId: booking.id,
      amount: plan.reconstruction.action === 'pair' ? plan.reconstruction.amount : 0,
      debitType: 'IPG_RETURNED_TO_CARD',
      inflowAt: original,
      outflowAt: original,
    }))
    await db.$transaction((tx) => applyHistoricalWalletFirstPair(tx, {
      userId: f.athlete.id,
      paymentId: payment.id,
      bookingId: booking.id,
      amount: 2_500,
      debitType: 'IPG_RETURNED_TO_CARD',
      inflowAt: original,
      outflowAt: original,
    }))
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })
    expect(wallet.balance).toBe(0)
    const rows = await db.walletTransaction.findMany({ where: { paymentId: payment.id } })
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.originalEventAt?.toISOString() === original.toISOString())).toBe(true)
    expect(rows.some((row) => row.type === 'REFUND_CREDIT')).toBe(false)
    expect(await db.userWithdrawRequest.count({ where: { userId: f.athlete.id } })).toBe(0)
  })

  it('rolls the wallet-first pair back when the surrounding transaction aborts', async () => {
    const f = await fixtures()
    const { payment } = await paidBooking(f, { date: future, amount: 4_000, method: 'IPG' })
    const { applyWalletFirstForConfirmedIpg } = await import('./walletFirstIpg')
    await expect(db.$transaction(async (tx) => {
      await applyWalletFirstForConfirmedIpg(tx, payment.id)
      throw new Error('crash-after-pair')
    })).rejects.toThrow(/crash-after-pair/)
    expect(await db.walletTransaction.count({ where: { paymentId: payment.id } })).toBe(0)
    expect(await db.wallet.findUnique({ where: { userId: f.athlete.id } })).toBeNull()
  })

  async function walletPaidBooking(f: Awaited<ReturnType<typeof fixtures>>, opts: { amount: number, date: string, startTime?: string, metadata?: Record<string, unknown> }) {
    await m.wallet.creditWallet(f.athlete.id, 52_000, { type: 'TOPUP_CREDIT', note: 'seed' })
    const { slot, booking, payment } = await paidBooking(f, { date: opts.date, startTime: opts.startTime, amount: opts.amount, method: 'PAID' })
    if (opts.metadata) {
      await db.payment.update({ where: { id: payment.id }, data: { metadataJson: JSON.stringify(opts.metadata) } })
    }
    await m.wallet.debitWallet(f.athlete.id, opts.amount, { type: 'PAYMENT_DEBIT', paymentId: payment.id, bookingId: booking.id })
    return { slot, booking, payment }
  }

  it('owner cancel of a full-wallet booking inside the deadline refunds the wallet and shows credit + clawback', async () => {
    const f = await fixtures()
    const tomorrow = addDaysToIsoDate(today, 1)
    const { slot, booking, payment } = await walletPaidBooking(f, { amount: 5_000, date: tomorrow, startTime: '09:00' })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'owner-cancel',
      paymentId: payment.id,
      userId: booking.userId,
      moneyOutcome: 'full_wallet_refund',
    })
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })).balance).toBe(52_000)
    const clubTx = await db.clubWalletTransaction.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: 'asc' } })
    expect(clubTx.map((t) => t.type)).toEqual(['BOOKING_CREDIT', 'CLAWBACK'])
    expect(await userDrift(f.athlete.id)).toBe(0)
    expect(await clubDrift(f.club.id)).toBe(0)
  })

  it('wallet row carrying stale gateway-reversed flags still refunds the wallet on owner cancel', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await walletPaidBooking(f, {
      amount: 5_000,
      date: future,
      metadata: { refNum: 'old', gatewayReversed: true, gatewayRefund: true, reversePending: false },
    })
    await m.settlement.creditOwnerForPaidPayment(payment.id, 'PENDING_ONLINE')
    const result = await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'owner-cancel',
      paymentId: payment.id,
      userId: booking.userId,
      moneyOutcome: 'full_wallet_refund',
    })
    expect(result.refund?.walletCredited).toBe(true)
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })).balance).toBe(52_000)
    expect(await db.walletTransaction.count({ where: { paymentId: payment.id, type: 'REFUND_CREDIT' } })).toBe(1)
    expect((await db.clubWallet.findUniqueOrThrow({ where: { clubId: f.club.id } })).balance).toBe(0)
  })

  it('cancel settles a never-settled wallet payment first: full refund nets to zero, zero refund keeps it on club books', async () => {
    const f = await fixtures()
    const full = await walletPaidBooking(f, { amount: 5_000, date: future, startTime: '10:00' })
    await m.cancellations.cancelCourtBooking({
      bookingId: full.booking.id,
      slotId: full.slot.id,
      reason: 'owner-cancel',
      paymentId: full.payment.id,
      userId: full.booking.userId,
      moneyOutcome: 'full_wallet_refund',
    })
    const fullClub = await db.clubWalletTransaction.findMany({ where: { paymentId: full.payment.id }, orderBy: { createdAt: 'asc' } })
    expect(fullClub.map((t) => t.type)).toEqual(['BOOKING_CREDIT', 'CLAWBACK'])
    expect(fullClub.reduce((sum, t) => sum + t.amount, 0)).toBe(0)

    const kept = await paidBooking(f, { date: future, startTime: '11:00', amount: 5_000, method: 'PAID' })
    await m.wallet.debitWallet(f.athlete.id, 5_000, { type: 'PAYMENT_DEBIT', paymentId: kept.payment.id, bookingId: kept.booking.id })
    await m.cancellations.cancelCourtBooking({
      bookingId: kept.booking.id,
      slotId: kept.slot.id,
      reason: 'athlete-cancel',
      paymentId: kept.payment.id,
      userId: kept.booking.userId,
      moneyOutcome: 'zero_refund',
    })
    const keptLedger = await db.settlementLedgerEntry.findUniqueOrThrow({ where: { paymentId: kept.payment.id } })
    expect(keptLedger.gross).toBe(5_000)
    expect(keptLedger.clawedBackAt).toBeNull()
    expect(await db.walletTransaction.count({ where: { paymentId: kept.payment.id, type: 'REFUND_CREDIT' } })).toBe(0)
    expect(await clubDrift(f.club.id)).toBe(0)
  })

  it('refund follows the debited wallet when the booking was re-linked to another account', async () => {
    const f = await fixtures()
    const other = await db.user.create({ data: { email: `other-${f.tag}@it.local`, name: 'Other' } })
    const { slot, booking, payment } = await walletPaidBooking(f, { amount: 5_000, date: future, startTime: '12:00' })
    await db.booking.update({ where: { id: booking.id }, data: { userId: other.id } })
    await m.cancellations.cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'owner-cancel',
      paymentId: payment.id,
      userId: other.id,
      moneyOutcome: 'full_wallet_refund',
    })
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })).balance).toBe(52_000)
    expect(await db.wallet.findUnique({ where: { userId: other.id } })).toBeNull()
  })

  it('cancel twice after a wallet refund never double-credits', async () => {
    const f = await fixtures()
    const { slot, booking, payment } = await walletPaidBooking(f, { amount: 5_000, date: future, startTime: '13:00' })
    const args = {
      bookingId: booking.id,
      slotId: slot.id,
      reason: 'owner-cancel',
      paymentId: payment.id,
      userId: booking.userId,
      moneyOutcome: 'full_wallet_refund' as const,
    }
    await m.cancellations.cancelCourtBooking(args)
    await m.refunds.refundPaymentForCancellation({ paymentId: payment.id, userId: booking.userId, reason: 'retry', bookingId: booking.id })
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: f.athlete.id } })).balance).toBe(52_000)
    expect(await db.walletTransaction.count({ where: { paymentId: payment.id, type: 'REFUND_CREDIT' } })).toBe(1)
  })
})
