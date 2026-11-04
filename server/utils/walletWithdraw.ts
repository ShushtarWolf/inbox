import {
  ATHLETE_WITHDRAW_DAILY_MAX_IRR,
  clampAthleteWithdrawAmount,
} from '#shared/athleteCashOut.ts'
import { formatUserDisplayName } from '#shared/userName.ts'
import {
  resolveWithdrawRail,
  type BankWithdrawRail,
} from '#shared/walletWithdrawRail.ts'
import {
  consumeWalletLocked,
  getAthleteCashOutBalance,
  getOrCreateWallet,
  getWalletWithdrawableBalance,
  lockWalletAvailable,
  unlockEligibleWalletSettlements,
  unlockWalletLocked,
} from './wallet'
import { notifyAdminWithdrawRequest } from './adminNotify'
import { notifyUserWithdrawPaid } from './withdrawPaidNotify'

export type BankWithdrawKind = BankWithdrawRail

/** Coaches cash out settlement; athletes may cash out top-up/refund credit. */
export async function resolveBankWithdrawKind(userId: string): Promise<BankWithdrawKind> {
  const coach = await prisma.coach.findFirst({
    where: { userId },
    select: { id: true },
  })
  return coach ? 'coach' : 'athlete'
}

/** @deprecated Prefer resolveBankWithdrawKind — athletes may cash out top-up/refund. */
export async function assertUserCanBankWithdraw(userId: string) {
  await resolveBankWithdrawKind(userId)
}

export async function requestUserWithdraw(options: {
  userId: string
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

  const coach = await prisma.coach.findFirst({
    where: { userId: options.userId },
    select: { id: true },
  })
  const isCoach = Boolean(coach)

  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const byKey = await tx.userWithdrawRequest.findFirst({
        where: { userId: options.userId, idempotencyKey },
        orderBy: { createdAt: 'desc' },
      })
      if (byKey) {
        return {
          request: byKey,
          rail: (byKey.rail as BankWithdrawRail | null) || 'athlete',
          created: false as const,
        }
      }
    }

    // Idempotent retries: same user+amount PENDING within 2 minutes → return existing.
    // Before the balance check — the first request's hold already moved available → locked.
    const dedupeSince = new Date(Date.now() - 2 * 60 * 1000)
    const existing = await tx.userWithdrawRequest.findFirst({
      where: {
        userId: options.userId,
        amount,
        status: 'PENDING',
        createdAt: { gte: dedupeSince },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) {
      return {
        request: existing,
        rail: (existing.rail as BankWithdrawRail | null) || 'athlete',
        created: false as const,
      }
    }

    await unlockEligibleWalletSettlements(options.userId, new Date(), tx)
    const wallet = await getOrCreateWallet(options.userId, tx)
    if (wallet.availableBalance < amount) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient wallet balance' })
    }

    const coachWithdrawable = isCoach
      ? await getWalletWithdrawableBalance(options.userId, new Date(), tx)
      : 0
    const athleteCashOutNet = await getAthleteCashOutBalance(options.userId, tx)

    const rail = resolveWithdrawRail({
      isCoach,
      amount,
      coachWithdrawable,
      athleteCashOut: athleteCashOutNet,
    })
    if (!rail) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient withdrawable balance' })
    }

    let withdrawable = 0
    if (rail === 'coach') {
      if (!isCoach) {
        throw createError({ statusCode: 409, statusMessage: 'Insufficient withdrawable balance' })
      }
      withdrawable = coachWithdrawable
    }
    else {
      const dayStart = new Date()
      dayStart.setHours(0, 0, 0, 0)
      const dailyUsed = await tx.userWithdrawRequest.aggregate({
        where: {
          userId: options.userId,
          status: { in: ['PENDING', 'PAID'] },
          createdAt: { gte: dayStart },
        },
        _sum: { amount: true },
      })
      const dailyRemaining = Math.max(0, ATHLETE_WITHDRAW_DAILY_MAX_IRR - Number(dailyUsed._sum.amount || 0))
      const clamp = clampAthleteWithdrawAmount(amount, {
        available: wallet.availableBalance,
        cashOutNet: athleteCashOutNet,
        dailyRemaining,
      })
      if (!clamp.ok) {
        throw createError({ statusCode: 409, statusMessage: 'Insufficient withdrawable balance' })
      }
      withdrawable = athleteCashOutNet
    }
    if (withdrawable < amount) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient withdrawable balance' })
    }

    const request = await tx.userWithdrawRequest.create({
      data: {
        userId: options.userId,
        amount,
        shebaSnapshot: sheba,
        status: 'PENDING',
        rail,
        note: options.note || null,
        idempotencyKey,
      },
    })

    await lockWalletAvailable(options.userId, amount, {
      type: 'WITHDRAW_HOLD',
      withdrawRequestId: request.id,
      note: 'Withdraw request hold',
    }, tx)

    return { request, rail, created: true as const }
  }).then(async ({ request, rail, created }) => {
    if (!created) return request
    try {
      const user = await prisma.user.findUnique({
        where: { id: options.userId },
        select: { name: true, nameFamily: true, phone: true },
      })
      const displayName = formatUserDisplayName(user?.name, user?.nameFamily)
      await notifyAdminWithdrawRequest({
        kind: rail === 'coach' ? 'coach' : 'athlete',
        amount: request.amount,
        sheba: request.shebaSnapshot,
        userName: displayName || user?.name || '',
        userPhone: user?.phone || '',
        requestId: request.id,
      })
    }
    catch (err) {
      console.error('[walletWithdraw:adminSms]', request.id, err)
    }
    return request
  })
}

export async function markUserWithdrawPaid(requestId: string, note?: string) {
  let newlyPaid = false
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.userWithdrawRequest.findUnique({ where: { id: requestId } })
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Withdraw request not found' })
    if (request.status === 'PAID') return request
    if (request.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'Withdraw request is not pending' })
    }

    const updated = await tx.userWithdrawRequest.update({
      where: { id: requestId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        note: note ?? request.note,
      },
    })

    await consumeWalletLocked(request.userId, request.amount, {
      type: 'WITHDRAW_PAID',
      withdrawRequestId: request.id,
      note: note || 'Marked paid by admin',
    }, tx)

    newlyPaid = true
    return updated
  })
  if (newlyPaid) await notifyUserWithdrawPaid(result)
  return result
}

export async function rejectUserWithdrawRequest(requestId: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.userWithdrawRequest.findUnique({ where: { id: requestId } })
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Withdraw request not found' })
    if (request.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'Withdraw request is not pending' })
    }

    const updated = await tx.userWithdrawRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        note: note ?? request.note,
      },
    })

    await unlockWalletLocked(request.userId, request.amount, {
      type: 'WITHDRAW_RELEASE',
      withdrawRequestId: request.id,
      note: note || 'Withdraw rejected — balance restored',
    }, tx)

    return updated
  })
}
