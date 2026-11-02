import {
  getWalletBalances,
  getWalletPendingClassBalance,
  getWalletWithdrawableBalance,
  unlockEligibleWalletSettlements,
} from '../../utils/wallet'
import { getUserShebaState, serializeShebaRequest } from '../../utils/shebaChange'
import { resolveShebaRequestUiStatus } from '#shared/shebaApproval.ts'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await unlockEligibleWalletSettlements(user.id)
  const [balances, withdrawableBalance, pendingClassBalance, coach] = await Promise.all([
    getWalletBalances(user.id),
    getWalletWithdrawableBalance(user.id),
    getWalletPendingClassBalance(user.id),
    prisma.coach.findFirst({ where: { userId: user.id }, select: { id: true } }),
  ])
  const canBankWithdraw = Boolean(coach)
  const [wallet, shebaState, pendingWithdraws, recentWithdraws] = await Promise.all([
    prisma.wallet.findUnique({
      where: { userId: user.id },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    }),
    canBankWithdraw ? getUserShebaState(user.id) : Promise.resolve({ sheba: null, pendingRequest: null, lastRejected: null }),
    canBankWithdraw
      ? prisma.userWithdrawRequest.findMany({
          where: { userId: user.id, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : Promise.resolve([]),
    canBankWithdraw
      ? prisma.userWithdrawRequest.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : Promise.resolve([]),
  ])

  const shebaUiStatus = canBankWithdraw
    ? resolveShebaRequestUiStatus({
        approvedSheba: shebaState.sheba,
        pendingRequest: shebaState.pendingRequest,
        lastRejected: shebaState.lastRejected,
      })
    : 'none'

  return {
    balance: balances.availableBalance,
    totalBalance: balances.balance,
    availableBalance: balances.availableBalance,
    lockedBalance: balances.lockedBalance,
    withdrawableBalance: canBankWithdraw ? withdrawableBalance : 0,
    pendingClassBalance,
    canBankWithdraw,
    sheba: canBankWithdraw ? (shebaState.sheba || null) : null,
    shebaUiStatus,
    pendingShebaRequest: canBankWithdraw && shebaState.pendingRequest
      ? serializeShebaRequest(shebaState.pendingRequest)
      : null,
    lastShebaRejection: canBankWithdraw && shebaState.lastRejected
      ? {
          adminNote: shebaState.lastRejected.adminNote,
          reviewedAt: shebaState.lastRejected.reviewedAt?.toISOString() ?? null,
        }
      : null,
    transactions: wallet?.transactions || [],
    pendingWithdraws,
    withdraws: recentWithdraws,
  }
})

