import {
  getWalletBalances,
  getWalletPendingClassBalance,
  getWalletWithdrawableBalance,
  unlockEligibleWalletSettlements,
} from '../../utils/wallet'

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
  const [wallet, dbUser, pendingWithdraws, recentWithdraws] = await Promise.all([
    prisma.wallet.findUnique({
      where: { userId: user.id },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { sheba: true },
    }),
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

  return {
    balance: balances.availableBalance,
    totalBalance: balances.balance,
    availableBalance: balances.availableBalance,
    lockedBalance: balances.lockedBalance,
    withdrawableBalance: canBankWithdraw ? withdrawableBalance : 0,
    pendingClassBalance,
    canBankWithdraw,
    sheba: canBankWithdraw ? (dbUser?.sheba || null) : null,
    transactions: wallet?.transactions || [],
    pendingWithdraws,
    withdraws: recentWithdraws,
  }
})

