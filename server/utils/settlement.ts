import type { ClubWalletTransactionType, Prisma } from '@prisma/client'
import {
  isSettlementCashoutEligible,
  resolveCoachCommissionBps,
  resolvePlatformCommissionBps,
  splitSettlement,
  sumEligibleSettlementNet,
} from '#shared/settlement.ts'
import { computeWithdrawableBalance, sumWithdrawnViaRail } from '#shared/walletTopUp.ts'
import { notifyAdminWithdrawRequest } from './adminNotify'
import { creditWallet, debitWallet } from './wallet'

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

/** Lazy-unlock class-locked club settlement once cashout-eligible. */
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
  const paymentIds = credits.map((c) => c.paymentId!).filter(Boolean)
  if (!paymentIds.length) {
    return {
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      lockedBalance: wallet.lockedBalance,
    }
  }

  const [ledgerRows, alreadyUnlocked] = await Promise.all([
    db.settlementLedgerEntry.findMany({
      where: { paymentId: { in: paymentIds }, clawedBackAt: null },
      select: { paymentId: true, classDate: true },
    }),
    db.clubWalletTransaction.findMany({
      where: { walletId: wallet.id, type: 'UNLOCK', paymentId: { in: paymentIds } },
      select: { paymentId: true },
    }),
  ])
  const unlocked = new Set(alreadyUnlocked.map((r) => r.paymentId).filter(Boolean))
  const classDateByPayment = new Map(ledgerRows.map((row) => [row.paymentId, row.classDate]))

  let toUnlock = 0
  const unlockPayments: Array<{ paymentId: string, bookingId?: string | null, amount: number }> = []
  for (const row of credits) {
    if (!row.paymentId || unlocked.has(row.paymentId)) continue
    const classDate = classDateByPayment.get(row.paymentId)
    if (classDate == null) continue
    if (!isSettlementCashoutEligible(classDate, now)) continue
    toUnlock += row.amount
    unlockPayments.push({ paymentId: row.paymentId, bookingId: row.bookingId, amount: row.amount })
  }
  if (toUnlock <= 0) {
    return {
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      lockedBalance: wallet.lockedBalance,
    }
  }

  const amount = Math.min(toUnlock, wallet.lockedBalance)
  const updated = await db.clubWallet.update({
    where: { id: wallet.id },
    data: {
      lockedBalance: { decrement: amount },
      availableBalance: { increment: amount },
    },
  })
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
      select: { ownerNet: true, classDate: true, clawedBackAt: true },
    }),
  ])
  const balance = wallet?.balance ?? 0
  const availableBalance = wallet?.availableBalance ?? balance
  const pendingClassBalance = wallet?.lockedBalance
    ?? sumEligibleSettlementNet(entries, now).pending
  if (availableBalance <= 0) {
    return { balance, availableBalance, lockedBalance: wallet?.lockedBalance ?? 0, withdrawableBalance: 0, pendingClassBalance }
  }
  const { eligible, pending } = sumEligibleSettlementNet(entries, now)
  const withdrawnViaRail = wallet ? await sumClubWithdrawnViaRail(wallet.id, db) : 0
  return {
    balance,
    availableBalance,
    lockedBalance: wallet?.lockedBalance ?? 0,
    withdrawableBalance: computeWithdrawableBalance(availableBalance, eligible, 0, withdrawnViaRail),
    pendingClassBalance: wallet?.lockedBalance ?? pending,
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
      packageBooking: { include: { package: true } },
      competitionEntry: { include: { competition: { select: { clubId: true } } } },
    },
  })
  if (!payment || payment.purpose === 'topup') return null
  if (payment.booking?.slot?.court?.clubId) {
    return {
      clubId: payment.booking.slot.court.clubId,
      bookingId: payment.booking.id,
      classDate: payment.booking.slot.date || null,
    }
  }
  if (payment.packageBooking?.package?.clubId) {
    return {
      clubId: payment.packageBooking.package.clubId,
      bookingId: payment.packageBookingId,
      classDate: null,
    }
  }
  if (payment.competitionEntry?.competition?.clubId) {
    return {
      clubId: payment.competitionEntry.competition.clubId,
      bookingId: payment.competitionEntry.id,
      classDate: null,
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
 * - Coach lesson fees → coach user wallet (COACH_COMMISSION_BPS / platform default 10%).
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
    const split = splitSettlement(payment.amount, resolveCoachCommissionBps())
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
  const metaSource = parsePaymentMetaSource(payment.metadataJson)
  const bps = metaSource === 'coach-lesson-court' ? 0 : resolvePlatformCommissionBps()
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

    await tx.settlementLedgerEntry.update({
      where: { id: current.id },
      data: { clawedBackAt: new Date() },
    })

    if (current.ownerNet > 0 && current.coachId) {
      const coach = await tx.coach.findUnique({
        where: { id: current.coachId },
        select: { userId: true },
      })
      if (coach?.userId) {
        await debitWallet(coach.userId, current.ownerNet, {
          type: 'SETTLEMENT_CLAWBACK',
          paymentId,
          bookingId: current.bookingId || undefined,
          note: 'Coach lesson cancel clawback',
          allowNegative: true,
        }, tx)
      }
    }
    else if (current.ownerNet > 0 && current.clubId) {
      await debitClubWallet(current.clubId, current.ownerNet, {
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
    const remainingNet = Math.max(0, current.ownerNet - alreadyClawed)
    if (remainingNet <= 0) {
      await tx.settlementLedgerEntry.update({
        where: { id: current.id },
        data: { clawedBackAt: new Date() },
      })
      return { clawed: false as const, reason: 'already_clawed' as const, amount: 0, entry: current }
    }

    const proportional = Math.floor((current.ownerNet * opts.grossRefundAmount) / current.gross)
    const net = Math.min(remainingNet, Math.max(0, proportional))
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

    if (alreadyClawed + net >= current.ownerNet) {
      await tx.settlementLedgerEntry.update({
        where: { id: current.id },
        data: { clawedBackAt: new Date() },
      })
    }

    return { clawed: true as const, reason: 'ok' as const, amount: net, entry: current }
  }

  if (db === prisma) {
    return prisma.$transaction(run)
  }
  return run(db as Prisma.TransactionClient)
}

export async function requestClubWithdraw(options: {
  clubId: string
  amount: number
  sheba: string | null | undefined
  note?: string
}) {
  const amount = Math.floor(Number(options.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Withdraw amount must be positive' })
  }
  const sheba = options.sheba?.trim() || null
  if (!sheba) {
    throw createError({ statusCode: 400, statusMessage: 'SHEBA is required before withdraw' })
  }

  return prisma.$transaction(async (tx) => {
    await unlockEligibleClubSettlements(options.clubId, new Date(), tx)
    const wallet = await getOrCreateClubWallet(options.clubId, tx)
    if (wallet.availableBalance < amount) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient club wallet balance' })
    }
    const entries = await tx.settlementLedgerEntry.findMany({
      where: { clubId: options.clubId, clawedBackAt: null },
      select: { ownerNet: true, classDate: true, clawedBackAt: true },
    })
    const { eligible } = sumEligibleSettlementNet(entries)
    const withdrawnViaRail = await sumClubWithdrawnViaRail(wallet.id, tx)
    if (computeWithdrawableBalance(wallet.availableBalance, eligible, 0, withdrawnViaRail) < amount) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient withdrawable balance' })
    }

    const request = await tx.withdrawRequest.create({
      data: {
        clubId: options.clubId,
        amount,
        shebaSnapshot: sheba,
        status: 'PENDING',
        note: options.note || null,
      },
    })

    await lockClubAvailable(options.clubId, amount, {
      type: 'WITHDRAW_HOLD',
      withdrawRequestId: request.id,
      note: 'Withdraw request hold',
    }, tx)

    return request
  }).then(async (request) => {
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
  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawRequest.findUnique({ where: { id: requestId } })
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Withdraw request not found' })
    if (request.status === 'PAID') return request
    if (request.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'Withdraw request is not pending' })
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

    return updated
  })
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
