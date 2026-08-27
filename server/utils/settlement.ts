import type { ClubWalletTransactionType, Prisma } from '@prisma/client'
import {
  resolveCoachCommissionBps,
  resolvePlatformCommissionBps,
  splitSettlement,
} from '#shared/settlement.ts'
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

async function creditClubWallet(
  clubId: string,
  amount: number,
  meta: {
    type: ClubWalletTransactionType
    paymentId?: string
    bookingId?: string
    withdrawRequestId?: string
    note?: string
  },
  db: DbClient,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Credit amount must be positive' })
  }
  const wallet = await getOrCreateClubWallet(clubId, db)
  const updated = await db.clubWallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: amount } },
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
    const updated = await db.clubWallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amount } },
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
    where: { id: wallet.id, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
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

async function resolveClubIdForPayment(
  paymentId: string,
  db: DbClient,
): Promise<{ clubId: string; bookingId: string | null } | null> {
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
    return { clubId: payment.booking.slot.court.clubId, bookingId: payment.booking.id }
  }
  if (payment.packageBooking?.package?.clubId) {
    return { clubId: payment.packageBooking.package.clubId, bookingId: payment.packageBookingId }
  }
  if (payment.competitionEntry?.competition?.clubId) {
    return {
      clubId: payment.competitionEntry.competition.clubId,
      bookingId: payment.competitionEntry.id,
    }
  }
  return null
}

async function resolveCoachForLessonPayment(
  paymentId: string,
  db: DbClient,
): Promise<{ coachId: string; userId: string; coachSessionId: string } | null> {
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
  }
}

/**
 * Credit payee net-after-commission when a payment becomes PAID.
 * - Coach lesson fees → coach user wallet (COACH_COMMISSION_BPS / platform default 10%).
 * - Club bookings / packages / competition entries / coach-lesson-court → club wallet
 *   (0 bps for court charge).
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

    const runCoach = async (tx: Prisma.TransactionClient) => {
      const raced = await tx.settlementLedgerEntry.findUnique({ where: { paymentId } })
      if (raced) return { credited: false as const, reason: 'already_settled' as const, entry: raced }

      const entry = await tx.settlementLedgerEntry.create({
        data: {
          coachId: coachPayee.coachId,
          paymentId,
          bookingId: coachPayee.coachSessionId,
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

  // Coach already paid the discounted court fee from their wallet — club gets 100%.
  // Skimming PLATFORM_COMMISSION_BPS would leave a phantom gap (coach −charge, club +90%).
  const metaSource = parsePaymentMetaSource(payment.metadataJson)
  const bps = metaSource === 'coach-lesson-court' ? 0 : resolvePlatformCommissionBps()
  const split = splitSettlement(payment.amount, bps)

  const run = async (tx: Prisma.TransactionClient) => {
    const raced = await tx.settlementLedgerEntry.findUnique({ where: { paymentId } })
    if (raced) return { credited: false as const, reason: 'already_settled' as const, entry: raced }

    const entry = await tx.settlementLedgerEntry.create({
      data: {
        clubId: resolved.clubId,
        paymentId,
        bookingId: resolved.bookingId,
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
    const wallet = await getOrCreateClubWallet(options.clubId, tx)
    if (wallet.balance < amount) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient club wallet balance' })
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

    await debitClubWallet(options.clubId, amount, {
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

    const wallet = await getOrCreateClubWallet(request.clubId, tx)
    await tx.clubWalletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: 0,
        type: 'WITHDRAW_PAID',
        withdrawRequestId: request.id,
        note: note || 'Marked paid by admin',
      },
    })

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

    await creditClubWallet(request.clubId, request.amount, {
      type: 'WITHDRAW_RELEASE',
      withdrawRequestId: request.id,
      note: note || 'Withdraw rejected — balance restored',
    }, tx)

    return updated
  })
}
