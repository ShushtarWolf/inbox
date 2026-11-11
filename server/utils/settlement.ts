/**
 * Settlement IO: club/coach wallet credit, clawback, withdraw requests.
 * Pure math (splitSettlement, cashout eligibility) is in shared/settlement.ts.
 */
import type { ClubWalletTransactionType, Prisma } from '@prisma/client'
import {
  isSeriesPaymentGroup,
  parseSeriesPaymentMeta,
} from '#shared/athleteSeason.ts'
import {
  isSettlementCashoutEligible,
  resolveClubCommissionBps,
  resolveCoachCommissionBps,
  splitSettlement,
  sumEligibleSettlementNet,
} from '#shared/settlement.ts'
import { loadPlatformCommissionBps } from './platformCommission.ts'
import {
  lastSessionDate,
  seasonUnlockDelta,
  targetSeasonUnlockedNet,
  type SeasonUnlockSession,
} from '#shared/seasonSettlementUnlock.ts'
import { localDateString } from '#shared/localDate.ts'
import { applyDebtAwareWithdrawCeiling, computeWithdrawableBalance, sumWithdrawnViaRail } from '#shared/walletTopUp.ts'
import { notifyAdminWithdrawRequest } from './adminNotify'
import { paymentIdsBlockedForWithdraw } from './reversedStillPaid'
import { notifyClubWithdrawPaid } from './withdrawPaidNotify'
import { creditWallet, debitWallet } from './wallet'
import { canSettleOwnerForPaidPayment } from '#shared/deskPaidGuard.ts'

type DbClient = Prisma.TransactionClient | typeof prisma

function parsePaymentMetaSource(metadataJson: string | null | undefined): string | null {
  if (!metadataJson) return null
  try {
    const parsed = JSON.parse(metadataJson) as { source?: unknown }
    return typeof parsed.source === 'string' ? parsed.source : null
  }
  catch {
    return null
  }
}

export async function getOrCreateClubWallet(clubId: string, db: DbClient = prisma) {
  return db.clubWallet.upsert({
    where: { clubId },
    update: {},
    create: { clubId },
  })
}

export async function getClubWalletBalance(clubId: string) {
  const wallet = await prisma.clubWallet.findUnique({ where: { clubId } })
  return wallet?.balance ?? 0
}

async function sumClubWithdrawnViaRail(walletId: string, db: DbClient) {
  const rows = await db.clubWalletTransaction.findMany({
    where: { walletId, type: { in: ['WITHDRAW_HOLD', 'WITHDRAW_RELEASE'] } },
    select: { amount: true, type: true },
  })
  let holdAbs = 0
  let releaseSum = 0
  for (const row of rows) {
    if (row.type === 'WITHDRAW_HOLD') holdAbs += Math.abs(row.amount)
    else releaseSum += Math.max(0, row.amount)
  }
  return sumWithdrawnViaRail(holdAbs, releaseSum)
}

async function loadSeasonUnlockSessionsForPayment(
  paymentId: string,
  db: DbClient,
): Promise<SeasonUnlockSession[] | null> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      metadataJson: true,
      bookingId: true,
      booking: { select: { id: true, status: true, slot: { select: { date: true, price: true } } } },
    },
  })
  if (!payment?.bookingId || !payment.booking) return null
  const meta = parseSeriesPaymentMeta(payment.metadataJson)
  if (!isSeriesPaymentGroup(meta)) return null

  const primaryId = meta.groupPrimaryBookingId || meta.coveredByBookingId || payment.bookingId
  const ids = [...new Set([
    primaryId,
    ...(meta.groupSiblingBookingIds || []),
    payment.bookingId,
  ].filter((id): id is string => Boolean(id)))]

  const bookings = await db.booking.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      status: true,
      slot: { select: { date: true, price: true } },
      payment: { select: { metadataJson: true } },
    },
  })
  if (bookings.length <= 1) return null

  return bookings
    .map((row) => {
      const sessionMeta = parseSeriesPaymentMeta(row.payment?.metadataJson)
      const sessionPrice = typeof sessionMeta.sessionPrice === 'number' && sessionMeta.sessionPrice > 0
        ? Math.floor(sessionMeta.sessionPrice)
        : (row.slot.price || 0)
      return {
        bookingId: row.id,
        date: row.slot.date,
        sessionPrice,
        cancelled: row.status === 'CANCELLED',
      } satisfies SeasonUnlockSession
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Lazy-unlock class-locked club settlement once cashout-eligible (progressive for seasons). */
export async function unlockEligibleClubSettlements(
  clubId: string,
  now = new Date(),
  db: DbClient = prisma,
) {
  const wallet = await getOrCreateClubWallet(clubId, db)
  if (wallet.lockedBalance <= 0) {
    return {
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      lockedBalance: wallet.lockedBalance,
    }
  }

  const credits = await db.clubWalletTransaction.findMany({
    where: { walletId: wallet.id, type: 'BOOKING_CREDIT', paymentId: { not: null } },
    select: { amount: true, paymentId: true, bookingId: true },
  })
  const paymentIds = [...new Set(credits.map((c) => c.paymentId!).filter(Boolean))]
  if (!paymentIds.length) {
    return {
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      lockedBalance: wallet.lockedBalance,
    }
  }

  const [ledgerRows, unlockRows, clawbackRows] = await Promise.all([
    db.settlementLedgerEntry.findMany({
      where: { paymentId: { in: paymentIds }, clawedBackAt: null },
      select: { paymentId: true, classDate: true, ownerNet: true },
    }),
    db.clubWalletTransaction.findMany({
      where: { walletId: wallet.id, type: 'UNLOCK', paymentId: { in: paymentIds } },
      select: { paymentId: true, amount: true, bookingId: true },
    }),
    db.clubWalletTransaction.findMany({
      where: { walletId: wallet.id, type: 'CLAWBACK', paymentId: { in: paymentIds } },
      select: { paymentId: true, amount: true },
    }),
  ])
  const ledgerByPayment = new Map(ledgerRows.map((row) => [row.paymentId, row]))
  const unlockedSumByPayment = new Map<string, number>()
  for (const row of unlockRows) {
    if (!row.paymentId) continue
    unlockedSumByPayment.set(
      row.paymentId,
      (unlockedSumByPayment.get(row.paymentId) || 0) + Math.max(0, row.amount),
    )
  }
  const clawbackByPayment = new Map<string, number>()
  for (const row of clawbackRows) {
    if (!row.paymentId) continue
    clawbackByPayment.set(
      row.paymentId,
      (clawbackByPayment.get(row.paymentId) || 0) + Math.abs(row.amount),
    )
  }

  let toUnlock = 0
  const unlockPayments: Array<{ paymentId: string, bookingId?: string | null, amount: number }> = []
  for (const paymentId of paymentIds) {
    const ledger = ledgerByPayment.get(paymentId)
    if (!ledger) continue
    const credit = credits.find((row) => row.paymentId === paymentId)
    const creditAmount = credit?.amount || ledger.ownerNet
    const already = unlockedSumByPayment.get(paymentId) || 0
    const clawed = clawbackByPayment.get(paymentId) || 0
    const remainingNet = Math.max(0, ledger.ownerNet - clawed)
    if (remainingNet <= 0 || already >= remainingNet) continue

    const sessions = await loadSeasonUnlockSessionsForPayment(paymentId, db)
    let delta = 0
    if (sessions && sessions.length > 1) {
      delta = seasonUnlockDelta({
        ownerNet: ledger.ownerNet,
        sessions,
        alreadyUnlocked: already,
        remainingNet,
        now,
      })
    }
    else {
      const classDate = ledger.classDate
      if (classDate == null) continue
      if (!isSettlementCashoutEligible(classDate, now)) continue
      delta = Math.max(0, Math.min(creditAmount, remainingNet) - already)
    }
    if (delta <= 0) continue
    toUnlock += delta
    unlockPayments.push({
      paymentId,
      bookingId: credit?.bookingId || null,
      amount: delta,
    })
  }
  if (toUnlock <= 0) {
    return {
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      lockedBalance: wallet.lockedBalance,
    }
  }

  const amount = Math.min(toUnlock, wallet.lockedBalance)
  // Claim locked atomically — concurrent unlocks must not overshoot available.
  const claimed = await db.clubWallet.updateMany({
    where: { id: wallet.id, lockedBalance: { gte: amount } },
    data: {
      lockedBalance: { decrement: amount },
      availableBalance: { increment: amount },
    },
  })
  if (claimed.count !== 1) {
    const fresh = await getOrCreateClubWallet(clubId, db)
    return {
      balance: fresh.balance,
      availableBalance: fresh.availableBalance,
      lockedBalance: fresh.lockedBalance,
    }
  }
  let remaining = amount
  for (const row of unlockPayments) {
    if (remaining <= 0) break
    const slice = Math.min(row.amount, remaining)
    await db.clubWalletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: slice,
        type: 'UNLOCK',
        paymentId: row.paymentId,
        bookingId: row.bookingId || undefined,
        note: 'Class cashout unlock',
      },
    })
    remaining -= slice
  }
  const updated = await getOrCreateClubWallet(clubId, db)
  return {
    balance: updated.balance,
    availableBalance: updated.availableBalance,
    lockedBalance: updated.lockedBalance,
  }
}

/**
 * Bank-withdrawable club balance: settlement nets for classes whose Tehran day has passed,
 * capped by availableBalance, minus prior withdraw holds/paid.
 */
export async function getClubWithdrawableBalance(
  clubId: string,
  now = new Date(),
  db: DbClient = prisma,
) {
  await unlockEligibleClubSettlements(clubId, now, db)
  const [wallet, entries] = await Promise.all([
    db.clubWallet.findUnique({
      where: { clubId },
      select: { id: true, balance: true, availableBalance: true, lockedBalance: true },
    }),
    db.settlementLedgerEntry.findMany({
      where: { clubId, clawedBackAt: null },
      select: { paymentId: true, ownerNet: true, classDate: true, clawedBackAt: true },
    }),
  ])
  const balance = wallet?.balance ?? 0
  const availableBalance = wallet?.availableBalance ?? balance
  // Series session refunds claw back pro-rata without setting clawedBackAt until fully reversed —
  // net those partial clawbacks out of each open entry so they cannot be withdrawn twice.
  const partialRows = wallet && entries.length
    ? await db.clubWalletTransaction.findMany({
        where: {
          walletId: wallet.id,
          type: 'CLAWBACK',
          paymentId: { in: entries.map((entry) => entry.paymentId) },
        },
        select: { paymentId: true, amount: true },
      })
    : []
  const partialByPayment = new Map<string, number>()
  for (const row of partialRows) {
    if (!row.paymentId) continue
    partialByPayment.set(row.paymentId, (partialByPayment.get(row.paymentId) || 0) + Math.abs(row.amount))
  }

  const blockedIds = await paymentIdsBlockedForWithdraw(
    entries.map((e) => e.paymentId),
    db as typeof prisma,
  )

  let eligible = 0
  let pending = 0
  for (const entry of entries) {
    // Card reversed but cancel not finished — do not let club cash out that net.
    if (blockedIds.has(entry.paymentId)) continue
    const remainingNet = Math.max(0, entry.ownerNet - (partialByPayment.get(entry.paymentId) || 0))
    if (remainingNet <= 0) continue
    const sessions = await loadSeasonUnlockSessionsForPayment(entry.paymentId, db)
    if (sessions && sessions.length > 1) {
      const unlockedTarget = Math.min(
        remainingNet,
        targetSeasonUnlockedNet({ ownerNet: entry.ownerNet, sessions, now }),
      )
      eligible += unlockedTarget
      pending += Math.max(0, remainingNet - unlockedTarget)
      continue
    }
    const single = sumEligibleSettlementNet(
      [{ ownerNet: remainingNet, classDate: entry.classDate }],
      now,
    )
    eligible += single.eligible
    pending += single.pending
  }
  // Pending class ≠ lockedBalance (locked also holds withdraw requests).
  if (availableBalance <= 0) {
    return {
      balance,
      availableBalance,
      lockedBalance: wallet?.lockedBalance ?? 0,
      withdrawableBalance: 0,
      pendingClassBalance: pending,
    }
  }
  const withdrawnViaRail = wallet ? await sumClubWithdrawnViaRail(wallet.id, db) : 0
  const rawWithdrawable = computeWithdrawableBalance(availableBalance, eligible, 0, withdrawnViaRail)
  return {
    balance,
    availableBalance,
    lockedBalance: wallet?.lockedBalance ?? 0,
    withdrawableBalance: applyDebtAwareWithdrawCeiling(rawWithdrawable, availableBalance, balance),
    pendingClassBalance: pending,
  }
}

async function creditClubWallet(
  clubId: string,
  amount: number,
  meta: {
    type: ClubWalletTransactionType
    paymentId?: string
    bookingId?: string
    withdrawRequestId?: string
    note?: string
    locked?: boolean
  },
  db: DbClient,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Credit amount must be positive' })
  }
  const wallet = await getOrCreateClubWallet(clubId, db)
  // Idempotent BOOKING_CREDIT per payment (+ booking for series) — matches WalletTransaction partial uniques.
  if (meta.paymentId && meta.type === 'BOOKING_CREDIT') {
    const existing = await db.clubWalletTransaction.findFirst({
      where: {
        paymentId: meta.paymentId,
        type: 'BOOKING_CREDIT',
        ...(meta.bookingId ? { bookingId: meta.bookingId } : { bookingId: null }),
      },
    })
    if (existing) return wallet
  }
  const intoLocked = Boolean(meta.locked)
  const updated = await db.clubWallet.update({
    where: { id: wallet.id },
    data: {
      balance: { increment: amount },
      ...(intoLocked
        ? { lockedBalance: { increment: amount } }
        : { availableBalance: { increment: amount } }),
    },
  })
  await db.clubWalletTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      type: meta.type,
      paymentId: meta.paymentId,
      bookingId: meta.bookingId,
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}

async function debitClubWallet(
  clubId: string,
  amount: number,
  meta: {
    type: ClubWalletTransactionType
    paymentId?: string
    bookingId?: string
    withdrawRequestId?: string
    note?: string
    allowNegative?: boolean
  },
  db: DbClient,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Debit amount must be positive' })
  }
  const wallet = await getOrCreateClubWallet(clubId, db)
  if (meta.allowNegative) {
    const fromLocked = Math.min(wallet.lockedBalance, amount)
    const fromAvailable = amount - fromLocked
    const updated = await db.clubWallet.update({
      where: { id: wallet.id },
      data: {
        balance: { decrement: amount },
        lockedBalance: { decrement: fromLocked },
        availableBalance: { decrement: fromAvailable },
      },
    })
    await db.clubWalletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: -amount,
        type: meta.type,
        paymentId: meta.paymentId,
        bookingId: meta.bookingId,
        withdrawRequestId: meta.withdrawRequestId,
        note: meta.note,
      },
    })
    return updated
  }
  const claimed = await db.clubWallet.updateMany({
    where: { id: wallet.id, availableBalance: { gte: amount }, balance: { gte: amount } },
    data: {
      balance: { decrement: amount },
      availableBalance: { decrement: amount },
    },
  })
  if (claimed.count !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'Insufficient club wallet balance' })
  }
  const updated = await db.clubWallet.findUniqueOrThrow({ where: { id: wallet.id } })
  await db.clubWalletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: -amount,
      type: meta.type,
      paymentId: meta.paymentId,
      bookingId: meta.bookingId,
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}

async function lockClubAvailable(
  clubId: string,
  amount: number,
  meta: {
    type: ClubWalletTransactionType
    withdrawRequestId?: string
    note?: string
  },
  db: DbClient,
) {
  const wallet = await getOrCreateClubWallet(clubId, db)
  const claimed = await db.clubWallet.updateMany({
    where: { id: wallet.id, availableBalance: { gte: amount } },
    data: {
      availableBalance: { decrement: amount },
      lockedBalance: { increment: amount },
    },
  })
  if (claimed.count !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'Insufficient available club wallet balance' })
  }
  const updated = await db.clubWallet.findUniqueOrThrow({ where: { id: wallet.id } })
  await db.clubWalletTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      type: meta.type,
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}

async function unlockClubLocked(
  clubId: string,
  amount: number,
  meta: {
    type: ClubWalletTransactionType
    withdrawRequestId?: string
    note?: string
  },
  db: DbClient,
) {
  const wallet = await getOrCreateClubWallet(clubId, db)
  const claimed = await db.clubWallet.updateMany({
    where: { id: wallet.id, lockedBalance: { gte: amount } },
    data: {
      lockedBalance: { decrement: amount },
      availableBalance: { increment: amount },
    },
  })
  if (claimed.count !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'Insufficient locked club wallet balance' })
  }
  const updated = await db.clubWallet.findUniqueOrThrow({ where: { id: wallet.id } })
  await db.clubWalletTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      type: meta.type,
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}

async function consumeClubLocked(
  clubId: string,
  amount: number,
  meta: {
    type: ClubWalletTransactionType
    withdrawRequestId?: string
    note?: string
  },
  db: DbClient,
) {
  const wallet = await getOrCreateClubWallet(clubId, db)
  const claimed = await db.clubWallet.updateMany({
    where: { id: wallet.id, lockedBalance: { gte: amount }, balance: { gte: amount } },
    data: {
      lockedBalance: { decrement: amount },
      balance: { decrement: amount },
    },
  })
  if (claimed.count !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'Insufficient locked club wallet balance' })
  }
  const updated = await db.clubWallet.findUniqueOrThrow({ where: { id: wallet.id } })
  await db.clubWalletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: 0,
      type: meta.type,
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}

async function resolveClubIdForPayment(
  paymentId: string,
  db: DbClient,
): Promise<{ clubId: string; bookingId: string | null; classDate: string | null } | null> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: { include: { slot: { include: { court: true } } } },
      packageBooking: { include: { package: { select: { clubId: true, startDate: true, finishDate: true } } } },
      competitionEntry: { include: { competition: { select: { clubId: true, eventAt: true } } } },
    },
  })
  if (!payment || payment.purpose === 'topup') return null
  if (payment.booking?.slot?.court?.clubId) {
    let classDate: string | null = payment.booking.slot.date || null
    const meta = parseSeriesPaymentMeta(payment.metadataJson)
    if (isSeriesPaymentGroup(meta)) {
      const primaryId = meta.groupPrimaryBookingId || meta.coveredByBookingId || payment.booking.id
      const ids = [...new Set([
        primaryId,
        ...(meta.groupSiblingBookingIds || []),
        payment.booking.id,
      ].filter((id): id is string => Boolean(id)))]
      if (ids.length > 1) {
        const slots = await db.booking.findMany({
          where: { id: { in: ids } },
          select: { slot: { select: { date: true } } },
        })
        classDate = lastSessionDate(
          slots.map((row, i) => ({
            bookingId: String(i),
            date: row.slot.date,
            sessionPrice: 1,
            cancelled: false,
          })),
        ) || classDate
      }
    }
    return {
      clubId: payment.booking.slot.court.clubId,
      bookingId: payment.booking.id,
      classDate,
    }
  }
  if (payment.packageBooking?.package?.clubId) {
    const pkg = payment.packageBooking.package
    const classDate = (pkg.startDate || pkg.finishDate || '').trim() || null
    return {
      clubId: pkg.clubId,
      bookingId: payment.packageBookingId,
      classDate,
    }
  }
  if (payment.competitionEntry?.competition?.clubId) {
    const competition = payment.competitionEntry.competition
    const classDate = competition.eventAt
      ? localDateString(competition.eventAt)
      : null
    return {
      clubId: competition.clubId,
      bookingId: payment.competitionEntry.id,
      classDate,
    }
  }
  return null
}

async function resolveCoachForLessonPayment(
  paymentId: string,
  db: DbClient,
): Promise<{ coachId: string; userId: string; coachSessionId: string; classDate: string | null } | null> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      coachSession: { include: { coach: { select: { id: true, userId: true } } } },
    },
  })
  if (!payment?.coachSessionId || !payment.coachSession) return null
  const userId = payment.coachSession.coach.userId
  if (!userId) return null
  return {
    coachId: payment.coachSession.coach.id,
    userId,
    coachSessionId: payment.coachSessionId,
    classDate: payment.coachSession.date || null,
  }
}

/**
 * Credit payee net-after-commission when a payment becomes PAID.
 * - Coach lesson fees → coach user wallet (COACH_COMMISSION_BPS / platform default 0%).
 * - Club bookings / packages / competition entries / coach-lesson-court → club wallet
 *   (0 bps for court charge).
 * Court/coach class settlements store classDate; cashout opens the Tehran day after.
 * Idempotent on paymentId via SettlementLedgerEntry unique constraint.
 */
export async function creditOwnerForPaidPayment(
  paymentId: string,
  previousStatus?: string,
  db: DbClient = prisma,
) {
  if (previousStatus === 'PAID') {
    return { credited: false as const, reason: 'already_paid' as const }
  }

  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.status !== 'PAID' || payment.purpose === 'topup') {
    return { credited: false as const, reason: 'not_paid_booking' as const }
  }
  // Desk cash / complimentary never entered platform float — do not create withdrawable liability.
  if (payment.method === 'CASH') {
    return { credited: false as const, reason: 'cash_not_settled' as const }
  }
  // Manual/desk IPG+PAID without a verified (or simulated) capture must not credit the club or coach wallet.
  if (payment.method === 'IPG' && !canSettleOwnerForPaidPayment(payment)) {
    return { credited: false as const, reason: 'ipg_unverified' as const }
  }

  const platformCommissionBps = await loadPlatformCommissionBps(db)

  const existing = await db.settlementLedgerEntry.findUnique({ where: { paymentId } })
  if (existing) {
    return {
      credited: false as const,
      reason: 'already_settled' as const,
      entry: existing,
    }
  }

  // Lesson fee paid by athlete → coach receives net after platform commission.
  if (payment.coachSessionId) {
    const coachPayee = await resolveCoachForLessonPayment(paymentId, db)
    if (!coachPayee) {
      return { credited: false as const, reason: 'no_coach_user' as const }
    }
    const split = splitSettlement(payment.amount, resolveCoachCommissionBps(undefined, platformCommissionBps))
    const lockUntilClass = Boolean(coachPayee.classDate)

    const runCoach = async (tx: Prisma.TransactionClient) => {
      const raced = await tx.settlementLedgerEntry.findUnique({ where: { paymentId } })
      if (raced) return { credited: false as const, reason: 'already_settled' as const, entry: raced }

      const entry = await tx.settlementLedgerEntry.create({
        data: {
          coachId: coachPayee.coachId,
          paymentId,
          bookingId: coachPayee.coachSessionId,
          classDate: coachPayee.classDate,
          gross: split.gross,
          commissionBps: split.commissionBps,
          commission: split.commission,
          ownerNet: split.ownerNet,
        },
      })

      if (split.ownerNet > 0) {
        await creditWallet(coachPayee.userId, split.ownerNet, {
          type: 'SETTLEMENT_CREDIT',
          paymentId,
          bookingId: coachPayee.coachSessionId,
          note: `Coach lesson settlement net (commission ${split.commission})`,
          locked: lockUntilClass,
        }, tx)
      }

      return { credited: true as const, reason: 'ok' as const, entry, split, payee: 'coach' as const }
    }

    if (db === prisma) {
      return prisma.$transaction(runCoach)
    }
    return runCoach(db as Prisma.TransactionClient)
  }

  const resolved = await resolveClubIdForPayment(paymentId, db)
  if (!resolved) {
    return { credited: false as const, reason: 'no_club' as const }
  }

  // Coach already paid the listed court fee from their wallet — club gets 100%.
  // Skimming PLATFORM_COMMISSION_BPS would leave a phantom gap (coach −charge, club +90%).
  // Only honor source=coach-lesson-court when a linked coach session proves the server path
  // (forged metadata on a normal booking must not zero commission).
  const metaSource = parsePaymentMetaSource(payment.metadataJson)
  const club = await db.club.findUnique({
    where: { id: resolved.clubId },
    select: { commissionBps: true },
  })
  let coachLessonCourt = false
  if (metaSource === 'coach-lesson-court' && payment.bookingId) {
    const linked = await db.coachSession.findFirst({
      where: { courtBookingId: payment.bookingId },
      select: { id: true },
    })
    coachLessonCourt = Boolean(linked)
  }
  const bps = coachLessonCourt ? 0 : resolveClubCommissionBps(club?.commissionBps, platformCommissionBps)
  const split = splitSettlement(payment.amount, bps)
  const lockUntilClass = Boolean(resolved.classDate)

  const run = async (tx: Prisma.TransactionClient) => {
    const raced = await tx.settlementLedgerEntry.findUnique({ where: { paymentId } })
    if (raced) return { credited: false as const, reason: 'already_settled' as const, entry: raced }

    const entry = await tx.settlementLedgerEntry.create({
      data: {
        clubId: resolved.clubId,
        paymentId,
        bookingId: resolved.bookingId,
        classDate: resolved.classDate,
        gross: split.gross,
        commissionBps: split.commissionBps,
        commission: split.commission,
        ownerNet: split.ownerNet,
      },
    })

    if (split.ownerNet > 0) {
      await creditClubWallet(resolved.clubId, split.ownerNet, {
        type: 'BOOKING_CREDIT',
        paymentId,
        bookingId: resolved.bookingId || undefined,
        note: `Settlement net (commission ${split.commission})`,
        locked: lockUntilClass,
      }, tx)
    }

    return { credited: true as const, reason: 'ok' as const, entry, split, payee: 'club' as const }
  }

  if (db === prisma) {
    return prisma.$transaction(run)
  }
  return run(db as Prisma.TransactionClient)
}

/**
 * Reverse payee credit after cancel/refund. Idempotent via clawedBackAt.
 * Club: allows negative club balance. Coach: allows negative user wallet.
 */
export async function clawbackOwnerForPayment(paymentId: string, db: DbClient = prisma) {
  const entry = await db.settlementLedgerEntry.findUnique({ where: { paymentId } })
  if (!entry) {
    return { clawed: false as const, reason: 'no_entry' as const }
  }
  if (entry.clawedBackAt) {
    return { clawed: false as const, reason: 'already_clawed' as const, entry }
  }

  const run = async (tx: Prisma.TransactionClient) => {
    const current = await tx.settlementLedgerEntry.findUnique({ where: { paymentId } })
    if (!current || current.clawedBackAt) {
      return { clawed: false as const, reason: 'already_clawed' as const, entry: current }
    }

    // Conditional claim: a concurrent clawback that already set clawedBackAt must not debit twice.
    const claimed = await tx.settlementLedgerEntry.updateMany({
      where: { id: current.id, clawedBackAt: null },
      data: {
        clawedBackAt: new Date(),
        // Athlete is refunded gross elsewhere. This records the platform slice
        // (gross - ownerNet) so the two liabilities add up. Does not change the clawback amount.
        commissionReversed: current.commission,
      },
    })
    if (claimed.count !== 1) {
      return { clawed: false as const, reason: 'already_clawed' as const, entry: current }
    }

    // Payee returns only what it was credited (platform refunds its own commission from float),
    // minus whatever series-session partial clawbacks already took.
    const prior = current.coachId
      ? await tx.walletTransaction.aggregate({
          where: { paymentId, type: 'SETTLEMENT_CLAWBACK' },
          _sum: { amount: true },
        })
      : await tx.clubWalletTransaction.aggregate({
          where: { paymentId, type: 'CLAWBACK' },
          _sum: { amount: true },
        })
    const clawbackAmount = Math.max(0, current.ownerNet - Math.abs(prior._sum.amount || 0))

    if (clawbackAmount > 0 && current.coachId) {
      const coach = await tx.coach.findUnique({
        where: { id: current.coachId },
        select: { userId: true },
      })
      if (coach?.userId) {
        await debitWallet(coach.userId, clawbackAmount, {
          type: 'SETTLEMENT_CLAWBACK',
          paymentId,
          bookingId: current.bookingId || undefined,
          note: 'Coach lesson cancel clawback',
          allowNegative: true,
        }, tx)
      }
    }
    else if (clawbackAmount > 0 && current.clubId) {
      await debitClubWallet(current.clubId, clawbackAmount, {
        type: 'CLAWBACK',
        paymentId,
        bookingId: current.bookingId || undefined,
        note: 'Cancel clawback',
        allowNegative: true,
      }, tx)
    }

    return { clawed: true as const, reason: 'ok' as const, entry: current }
  }

  if (db === prisma) {
    return prisma.$transaction(run)
  }
  return run(db as Prisma.TransactionClient)
}

/**
 * Pro-rata clawback for series session refunds. Append-only; sets clawedBackAt only when
 * cumulative clawbacks reach ownerNet. Idempotent on (paymentId, bookingId, CLAWBACK type).
 */
export async function clawbackOwnerPartialForPayment(opts: {
  paymentId: string
  grossRefundAmount: number
  bookingId: string
  db?: DbClient
}) {
  const db = opts.db || prisma
  const entry = await db.settlementLedgerEntry.findUnique({ where: { paymentId: opts.paymentId } })
  if (!entry) {
    return { clawed: false as const, reason: 'no_entry' as const, amount: 0 }
  }
  if (entry.clawedBackAt) {
    return { clawed: false as const, reason: 'already_clawed' as const, amount: 0, entry }
  }
  if (entry.gross <= 0 || opts.grossRefundAmount <= 0) {
    return { clawed: false as const, reason: 'zero' as const, amount: 0, entry }
  }

  const run = async (tx: Prisma.TransactionClient) => {
    const current = await tx.settlementLedgerEntry.findUnique({ where: { paymentId: opts.paymentId } })
    if (!current || current.clawedBackAt) {
      return { clawed: false as const, reason: 'already_clawed' as const, amount: 0, entry: current }
    }

    if (current.clubId) {
      const existing = await tx.clubWalletTransaction.findFirst({
        where: {
          paymentId: opts.paymentId,
          bookingId: opts.bookingId,
          type: 'CLAWBACK',
        },
      })
      if (existing) {
        return { clawed: false as const, reason: 'already_session' as const, amount: 0, entry: current }
      }
    }
    else if (current.coachId) {
      const coach = await tx.coach.findUnique({
        where: { id: current.coachId },
        select: { userId: true },
      })
      if (coach?.userId) {
        const wallet = await tx.wallet.findUnique({ where: { userId: coach.userId } })
        if (wallet) {
          const existing = await tx.walletTransaction.findFirst({
            where: {
              walletId: wallet.id,
              paymentId: opts.paymentId,
              bookingId: opts.bookingId,
              type: 'SETTLEMENT_CLAWBACK',
            },
          })
          if (existing) {
            return { clawed: false as const, reason: 'already_session' as const, amount: 0, entry: current }
          }
        }
      }
    }

    const priorClub = current.clubId
      ? await tx.clubWalletTransaction.findMany({
          where: { paymentId: opts.paymentId, type: 'CLAWBACK' },
          select: { amount: true },
        })
      : []
    const priorCoach = current.coachId
      ? await tx.walletTransaction.findMany({
          where: { paymentId: opts.paymentId, type: 'SETTLEMENT_CLAWBACK' },
          select: { amount: true },
        })
      : []
    const alreadyClawed = [...priorClub, ...priorCoach].reduce((sum, row) => sum + Math.abs(row.amount), 0)
    const clawCap = current.ownerNet
    const remaining = Math.max(0, clawCap - alreadyClawed)
    if (remaining <= 0) {
      await tx.settlementLedgerEntry.update({
        where: { id: current.id },
        data: { clawedBackAt: new Date() },
      })
      return { clawed: false as const, reason: 'already_clawed' as const, amount: 0, entry: current }
    }

    const proportional = Math.floor((current.ownerNet * opts.grossRefundAmount) / current.gross)
    const net = Math.min(remaining, Math.max(0, proportional))
    if (net <= 0) {
      return { clawed: false as const, reason: 'zero' as const, amount: 0, entry: current }
    }

    if (current.coachId) {
      const coach = await tx.coach.findUnique({
        where: { id: current.coachId },
        select: { userId: true },
      })
      if (coach?.userId) {
        await debitWallet(coach.userId, net, {
          type: 'SETTLEMENT_CLAWBACK',
          paymentId: opts.paymentId,
          bookingId: opts.bookingId,
          note: 'Series session cancel clawback',
          allowNegative: true,
        }, tx)
      }
    }
    else if (current.clubId) {
      await debitClubWallet(current.clubId, net, {
        type: 'CLAWBACK',
        paymentId: opts.paymentId,
        bookingId: opts.bookingId,
        note: 'Series session cancel clawback',
        allowNegative: true,
      }, tx)
    }

    const fullyClawed = alreadyClawed + net >= clawCap
    await tx.settlementLedgerEntry.update({
      where: { id: current.id },
      data: fullyClawed
        ? { clawedBackAt: new Date(), commissionReversed: current.commission }
        : { commissionReversed: { increment: Math.max(0, opts.grossRefundAmount - net) } },
    })

    return { clawed: true as const, reason: 'ok' as const, amount: net, entry: current }
  }

  if (db === prisma) {
    return prisma.$transaction(run)
  }
  return run(db as Prisma.TransactionClient)
}

/**
 * Move club funds that already exist (available, then locked settlement) to pay a
 * competition wallet prize. Rejects when balance cannot cover the prize. Never goes negative.
 */
export async function debitClubWalletForPrize(
  clubId: string,
  amount: number,
  note: string,
  db: DbClient,
) {
  if (amount <= 0) return { debited: false as const }
  const wallet = await getOrCreateClubWallet(clubId, db)
  const fromLocked = Math.min(wallet.lockedBalance, amount)
  const fromAvailable = amount - fromLocked
  if (wallet.balance < amount || fromAvailable > wallet.availableBalance) {
    throw createError({ statusCode: 409, statusMessage: 'PRIZE_UNFUNDED' })
  }
  const claimed = await db.clubWallet.updateMany({
    where: {
      id: wallet.id,
      balance: { gte: amount },
      lockedBalance: { gte: fromLocked },
      availableBalance: { gte: fromAvailable },
    },
    data: {
      balance: { decrement: amount },
      lockedBalance: { decrement: fromLocked },
      availableBalance: { decrement: fromAvailable },
    },
  })
  if (claimed.count !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'PRIZE_UNFUNDED' })
  }
  await db.clubWalletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: -amount,
      type: 'ADJUSTMENT',
      note,
    },
  })
  return { debited: true as const, amount }
}

export async function requestClubWithdraw(options: {
  clubId: string
  amount: number
  sheba: string | null | undefined
  note?: string
  idempotencyKey?: string | null
}) {
  const amount = Math.floor(Number(options.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Withdraw amount must be positive' })
  }
  const sheba = options.sheba?.trim() || null
  if (!sheba) {
    throw createError({ statusCode: 400, statusMessage: 'SHEBA is required before withdraw' })
  }
  const idempotencyKey = options.idempotencyKey?.trim() || null

  const club = await prisma.club.findUnique({
    where: { id: options.clubId },
    select: { status: true },
  })
  if (!club || club.status !== 'ACTIVE') {
    throw createError({ statusCode: 403, statusMessage: 'CLUB_NOT_ACTIVE' })
  }

  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const byKey = await tx.withdrawRequest.findFirst({
        where: { clubId: options.clubId, idempotencyKey },
        orderBy: { createdAt: 'desc' },
      })
      if (byKey) return { request: byKey, created: false as const }
    }

    // Retry dedupe before balance gates — the first request's hold already moved available → locked.
    const dedupeSince = new Date(Date.now() - 2 * 60 * 1000)
    const existing = await tx.withdrawRequest.findFirst({
      where: {
        clubId: options.clubId,
        amount,
        status: 'PENDING',
        createdAt: { gte: dedupeSince },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) return { request: existing, created: false as const }

    // Same math the finance page shows (incl. partial series clawbacks) — never a looser gate.
    const balances = await getClubWithdrawableBalance(options.clubId, new Date(), tx)
    if (balances.availableBalance < amount) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient club wallet balance' })
    }
    if (balances.withdrawableBalance < amount) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient withdrawable balance' })
    }

    const request = await tx.withdrawRequest.create({
      data: {
        clubId: options.clubId,
        amount,
        shebaSnapshot: sheba,
        status: 'PENDING',
        note: options.note || null,
        idempotencyKey,
      },
    })

    await lockClubAvailable(options.clubId, amount, {
      type: 'WITHDRAW_HOLD',
      withdrawRequestId: request.id,
      note: 'Withdraw request hold',
    }, tx)

    return { request, created: true as const }
  }).then(async ({ request, created }) => {
    if (!created) return request
    try {
      const club = await prisma.club.findUnique({
        where: { id: options.clubId },
        select: { nameFa: true, nameEn: true },
      })
      await notifyAdminWithdrawRequest({
        kind: 'club',
        amount: request.amount,
        sheba: request.shebaSnapshot,
        clubName: club?.nameFa || club?.nameEn || '',
        clubId: options.clubId,
        requestId: request.id,
      })
    } catch (err) {
      console.error('[settlement:adminWithdrawSms]', request.id, err)
    }
    return request
  })
}

export async function markWithdrawPaid(requestId: string, note?: string) {
  let newlyPaid = false
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.withdrawRequest.findUnique({
      where: { id: requestId },
      include: { club: { select: { status: true } } },
    })
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Withdraw request not found' })
    if (request.status === 'PAID') return request
    if (request.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'Withdraw request is not pending' })
    }
    if (request.club.status === 'SUSPENDED') {
      throw createError({ statusCode: 409, statusMessage: 'CLUB_SUSPENDED' })
    }

    const updated = await tx.withdrawRequest.update({
      where: { id: requestId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        note: note ?? request.note,
      },
    })

    await consumeClubLocked(request.clubId, request.amount, {
      type: 'WITHDRAW_PAID',
      withdrawRequestId: request.id,
      note: note || 'Marked paid by admin',
    }, tx)

    newlyPaid = true
    return updated
  })
  if (newlyPaid) await notifyClubWithdrawPaid(result)
  return result
}

/** Reject all PENDING club withdraws (e.g. on SUSPENDED). */
export async function rejectPendingClubWithdraws(clubId: string, note = 'Club suspended — withdraw frozen') {
  const pending = await prisma.withdrawRequest.findMany({
    where: { clubId, status: 'PENDING' },
    select: { id: true },
  })
  const rejected: string[] = []
  for (const row of pending) {
    await rejectWithdrawRequest(row.id, note)
    rejected.push(row.id)
  }
  return { rejected }
}

export async function rejectWithdrawRequest(requestId: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawRequest.findUnique({ where: { id: requestId } })
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Withdraw request not found' })
    if (request.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'Withdraw request is not pending' })
    }

    const updated = await tx.withdrawRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        note: note ?? request.note,
      },
    })

    await unlockClubLocked(request.clubId, request.amount, {
      type: 'WITHDRAW_RELEASE',
      withdrawRequestId: request.id,
      note: note || 'Withdraw rejected — balance restored',
    }, tx)

    return updated
  })
}
