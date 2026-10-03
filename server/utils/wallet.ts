import { Prisma, type WalletTransactionType } from '@prisma/client'
import { isSettlementCashoutEligible } from '#shared/settlement.ts'
import {
  canCoverBookingWithWallet,
  computeWithdrawableBalance,
  shouldCreditTopUp,
  sumWithdrawnViaRail,
} from '#shared/walletTopUp.ts'

type DbClient = Prisma.TransactionClient | typeof prisma

export async function getOrCreateWallet(userId: string, db: DbClient = prisma) {
  return db.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })
}

/** Spendable balance (available). Total including locked is on wallet.balance. */
export async function getWalletBalance(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } })
  return wallet?.availableBalance ?? wallet?.balance ?? 0
}

export async function getWalletAvailableBalance(userId: string) {
  return getWalletBalance(userId)
}

export async function getWalletBalances(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } })
  return {
    balance: wallet?.balance ?? 0,
    availableBalance: wallet?.availableBalance ?? wallet?.balance ?? 0,
    lockedBalance: wallet?.lockedBalance ?? 0,
  }
}

async function sumWalletWithdrawnViaRail(walletId: string, db: DbClient) {
  const rows = await db.walletTransaction.findMany({
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

/**
 * Bank-withdrawable balance: cash-backed coach settlement nets only.
 * Cap by availableBalance; subtract prior withdraw holds/paid so mixed wallets cannot leak.
 */
export async function getWalletWithdrawableBalance(
  userId: string,
  now = new Date(),
  db: DbClient = prisma,
) {
  const wallet = await db.wallet.findUnique({
    where: { userId },
    select: {
      id: true,
      balance: true,
      availableBalance: true,
      transactions: {
        where: { type: { in: ['SETTLEMENT_CREDIT', 'SETTLEMENT_CLAWBACK'] } },
        select: { amount: true, type: true, paymentId: true },
      },
    },
  })
  const spendable = wallet?.availableBalance ?? wallet?.balance ?? 0
  if (!wallet || spendable <= 0) return 0

  const paymentIds = wallet.transactions
    .map((row) => row.paymentId)
    .filter((id): id is string => Boolean(id))
  const ledgerRows = paymentIds.length
    ? await db.settlementLedgerEntry.findMany({
        where: { paymentId: { in: paymentIds } },
        select: { paymentId: true, classDate: true },
      })
    : []
  const classDateByPayment = new Map(ledgerRows.map((row) => [row.paymentId, row.classDate]))

  let creditSum = 0
  let clawbackSum = 0
  for (const row of wallet.transactions) {
    if (row.type === 'SETTLEMENT_CLAWBACK') {
      clawbackSum += row.amount
      continue
    }
    const classDate = row.paymentId ? classDateByPayment.get(row.paymentId) : null
    if (!isSettlementCashoutEligible(classDate ?? null, now)) continue
    creditSum += row.amount
  }
  const withdrawnViaRail = await sumWalletWithdrawnViaRail(wallet.id, db)
  return computeWithdrawableBalance(spendable, creditSum, clawbackSum, withdrawnViaRail)
}

/** Settlement nets still held until the day after class (coach wallet). */
export async function getWalletPendingClassBalance(userId: string, now = new Date()) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: {
      lockedBalance: true,
      transactions: {
        where: { type: 'SETTLEMENT_CREDIT' },
        select: { amount: true, paymentId: true },
      },
    },
  })
  if (!wallet) return 0
  if (wallet.lockedBalance > 0) return wallet.lockedBalance
  const paymentIds = wallet.transactions
    .map((row) => row.paymentId)
    .filter((id): id is string => Boolean(id))
  if (!paymentIds.length) return 0
  const ledgerRows = await prisma.settlementLedgerEntry.findMany({
    where: { paymentId: { in: paymentIds }, clawedBackAt: null },
    select: { paymentId: true, classDate: true },
  })
  const classDateByPayment = new Map(ledgerRows.map((row) => [row.paymentId, row.classDate]))
  let pending = 0
  for (const row of wallet.transactions) {
    if (!row.paymentId) continue
    const classDate = classDateByPayment.get(row.paymentId)
    if (classDate == null) continue
    if (!isSettlementCashoutEligible(classDate, now)) pending += row.amount
  }
  return pending
}

/** Lazy-unlock class-locked settlement once cashout-eligible (balance unchanged). */
export async function unlockEligibleWalletSettlements(
  userId: string,
  now = new Date(),
  db: DbClient = prisma,
) {
  const wallet = await getOrCreateWallet(userId, db)
  if (wallet.lockedBalance <= 0) return wallet

  const credits = await db.walletTransaction.findMany({
    where: { walletId: wallet.id, type: 'SETTLEMENT_CREDIT', paymentId: { not: null } },
    select: { amount: true, paymentId: true, bookingId: true },
  })
  const paymentIds = credits.map((c) => c.paymentId!).filter(Boolean)
  if (!paymentIds.length) return wallet

  const [ledgerRows, alreadyUnlocked] = await Promise.all([
    db.settlementLedgerEntry.findMany({
      where: { paymentId: { in: paymentIds }, clawedBackAt: null },
      select: { paymentId: true, classDate: true },
    }),
    db.walletTransaction.findMany({
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
  if (toUnlock <= 0) return wallet

  const amount = Math.min(toUnlock, wallet.lockedBalance)
  const updated = await db.wallet.update({
    where: { id: wallet.id },
    data: {
      lockedBalance: { decrement: amount },
      availableBalance: { increment: amount },
    },
  })
  // One UNLOCK row per payment for idempotency
  let remaining = amount
  for (const row of unlockPayments) {
    if (remaining <= 0) break
    const slice = Math.min(row.amount, remaining)
    await db.walletTransaction.create({
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
  return updated
}

export async function creditWallet(
  userId: string,
  amount: number,
  meta: {
    type?: WalletTransactionType
    paymentId?: string
    bookingId?: string
    withdrawRequestId?: string
    note?: string
    /** Credit into locked (pending class settlement). Default: available. */
    locked?: boolean
  },
  db: DbClient = prisma,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Credit amount must be positive' })
  }
  const type = meta.type || 'REFUND_CREDIT'
  const idempotent = Boolean(
    meta.paymentId && (type === 'REFUND_CREDIT' || type === 'TOPUP_CREDIT' || type === 'SETTLEMENT_CREDIT'),
  )

  const apply = async (tx: DbClient) => {
    const wallet = await getOrCreateWallet(userId, tx)
    if (idempotent) {
      const existing = await tx.walletTransaction.findFirst({
        where: {
          paymentId: meta.paymentId,
          type,
          ...(meta.bookingId ? { bookingId: meta.bookingId } : { bookingId: null }),
        },
      })
      if (existing) return wallet
    }
    const intoLocked = Boolean(meta.locked)
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: { increment: amount },
        ...(intoLocked
          ? { lockedBalance: { increment: amount } }
          : { availableBalance: { increment: amount } }),
      },
    })
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type,
        paymentId: meta.paymentId,
        bookingId: meta.bookingId,
        withdrawRequestId: meta.withdrawRequestId,
        note: meta.note,
      },
    })
    return updated
  }

  if ('$transaction' in db && typeof db.$transaction === 'function') {
    try {
      return await db.$transaction((tx) => apply(tx))
    }
    catch (error) {
      if (idempotent && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return getOrCreateWallet(userId, prisma)
      }
      throw error
    }
  }

  return apply(db)
}

export async function creditWalletForTopUpPayment(
  paymentId: string,
  previousStatus: string,
  db: DbClient = prisma,
) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  const existing = payment
    ? await db.walletTransaction.findFirst({
        where: { paymentId: payment.id, type: 'TOPUP_CREDIT' },
      })
    : null

  if (!shouldCreditTopUp({
    previousStatus,
    purpose: payment?.purpose,
    status: payment?.status,
    userId: payment?.userId,
    alreadyCredited: Boolean(existing),
  }) || !payment?.userId) {
    return {
      credited: false,
      reason: previousStatus === 'PAID'
        ? 'already_paid' as const
        : existing
          ? 'already_credited' as const
          : 'not_topup_paid' as const,
    }
  }

  await creditWallet(payment.userId, payment.amount, {
    type: 'TOPUP_CREDIT',
    paymentId: payment.id,
    note: 'Wallet top-up',
  }, db)
  return { credited: true, reason: 'ok' as const }
}

/** True when checkout may debit wallet for the full amount (MVP: no split). */
export function canDebitWalletForFullAmount(balance: number, amount: number): boolean {
  return canCoverBookingWithWallet(balance, amount)
}

/**
 * Move available → locked without changing total balance (withdraw request hold).
 */
export async function lockWalletAvailable(
  userId: string,
  amount: number,
  meta: {
    type?: WalletTransactionType
    paymentId?: string
    bookingId?: string
    withdrawRequestId?: string
    note?: string
  },
  db: DbClient,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Lock amount must be positive' })
  }
  const wallet = await getOrCreateWallet(userId, db)
  const claimed = await db.wallet.updateMany({
    where: { id: wallet.id, availableBalance: { gte: amount } },
    data: {
      availableBalance: { decrement: amount },
      lockedBalance: { increment: amount },
    },
  })
  if (claimed.count !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'Insufficient available wallet balance' })
  }
  const updated = await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      type: meta.type || 'WITHDRAW_HOLD',
      paymentId: meta.paymentId,
      bookingId: meta.bookingId,
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}

/** Move locked → available (withdraw reject / unlock). */
export async function unlockWalletLocked(
  userId: string,
  amount: number,
  meta: {
    type?: WalletTransactionType
    paymentId?: string
    bookingId?: string
    withdrawRequestId?: string
    note?: string
  },
  db: DbClient,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Unlock amount must be positive' })
  }
  const wallet = await getOrCreateWallet(userId, db)
  const claimed = await db.wallet.updateMany({
    where: { id: wallet.id, lockedBalance: { gte: amount } },
    data: {
      lockedBalance: { decrement: amount },
      availableBalance: { increment: amount },
    },
  })
  if (claimed.count !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'Insufficient locked wallet balance' })
  }
  const updated = await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      type: meta.type || 'WITHDRAW_RELEASE',
      paymentId: meta.paymentId,
      bookingId: meta.bookingId,
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}

/** Remove locked funds from the platform (withdraw marked paid). */
export async function consumeWalletLocked(
  userId: string,
  amount: number,
  meta: {
    type?: WalletTransactionType
    withdrawRequestId?: string
    note?: string
  },
  db: DbClient,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Consume amount must be positive' })
  }
  const wallet = await getOrCreateWallet(userId, db)
  const claimed = await db.wallet.updateMany({
    where: { id: wallet.id, lockedBalance: { gte: amount }, balance: { gte: amount } },
    data: {
      lockedBalance: { decrement: amount },
      balance: { decrement: amount },
    },
  })
  if (claimed.count !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'Insufficient locked wallet balance' })
  }
  const updated = await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: 0,
      type: meta.type || 'WITHDRAW_PAID',
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}

export async function debitWallet(
  userId: string,
  amount: number,
  meta: {
    type?: WalletTransactionType
    paymentId?: string
    bookingId?: string
    withdrawRequestId?: string
    note?: string
    /** Settlement clawback may go negative if coach already spent net on courts. */
    allowNegative?: boolean
    /** Debit locked instead of available (class settlement clawback). */
    fromLocked?: boolean
  },
  db: DbClient = prisma,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Debit amount must be positive' })
  }
  const wallet = await getOrCreateWallet(userId, db)
  if (meta.allowNegative) {
    // Prefer locked, then available, allow total negative for settlement clawback.
    const fromLocked = Math.min(wallet.lockedBalance, amount)
    const fromAvailable = amount - fromLocked
    const updated = await db.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: { decrement: amount },
        lockedBalance: { decrement: fromLocked },
        availableBalance: { decrement: fromAvailable },
      },
    })
    await db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: -amount,
        type: meta.type || 'PAYMENT_DEBIT',
        paymentId: meta.paymentId,
        bookingId: meta.bookingId,
        withdrawRequestId: meta.withdrawRequestId,
        note: meta.note,
      },
    })
    return updated
  }

  if (meta.fromLocked) {
    const claimed = await db.wallet.updateMany({
      where: { id: wallet.id, lockedBalance: { gte: amount }, balance: { gte: amount } },
      data: {
        balance: { decrement: amount },
        lockedBalance: { decrement: amount },
      },
    })
    if (claimed.count !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient locked wallet balance' })
    }
  }
  else {
    // Spend / transfer from available only.
    const claimed = await db.wallet.updateMany({
      where: { id: wallet.id, availableBalance: { gte: amount }, balance: { gte: amount } },
      data: {
        balance: { decrement: amount },
        availableBalance: { decrement: amount },
      },
    })
    if (claimed.count !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient wallet balance' })
    }
  }
  const updated = await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: -amount,
      type: meta.type || 'PAYMENT_DEBIT',
      paymentId: meta.paymentId,
      bookingId: meta.bookingId,
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}
