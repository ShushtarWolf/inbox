import type { ClubWalletTransactionType, Prisma } from '@prisma/client'
import { resolvePlatformCommissionBps, splitSettlement } from '#shared/settlement.ts'

type DbClient = Prisma.TransactionClient | typeof prisma

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
  if (!meta.allowNegative && wallet.balance < amount) {
    throw createError({ statusCode: 409, statusMessage: 'Insufficient club wallet balance' })
  }
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

async function resolveClubIdForPayment(
  paymentId: string,
  db: DbClient,
): Promise<{ clubId: string; bookingId: string | null } | null> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: { include: { slot: { include: { court: true } } } },
      coachSession: { include: { coach: true } },
      packageBooking: { include: { package: true } },
    },
  })
  if (!payment || payment.purpose === 'topup') return null
  if (payment.booking?.slot?.court?.clubId) {
    return { clubId: payment.booking.slot.court.clubId, bookingId: payment.booking.id }
  }
  if (payment.coachSession?.coach?.clubId) {
    return { clubId: payment.coachSession.coach.clubId, bookingId: payment.coachSessionId }
  }
  if (payment.packageBooking?.package?.clubId) {
    return { clubId: payment.packageBooking.package.clubId, bookingId: payment.packageBookingId }
  }
  return null
}

/**
 * Credit owner club wallet with net-after-commission when a payment becomes PAID.
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

  const resolved = await resolveClubIdForPayment(paymentId, db)
  if (!resolved) {
    return { credited: false as const, reason: 'no_club' as const }
  }

  const bps = resolvePlatformCommissionBps()
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

    return { credited: true as const, reason: 'ok' as const, entry, split }
  }

  if (db === prisma) {
    return prisma.$transaction(run)
  }
  return run(db as Prisma.TransactionClient)
}

/**
 * Reverse owner credit after cancel/refund. Idempotent via clawedBackAt.
 * Allows negative club balance if desk cash already withdrawn conceptually.
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

    if (current.ownerNet > 0) {
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
