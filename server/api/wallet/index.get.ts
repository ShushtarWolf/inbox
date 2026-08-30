import { getWalletBalance, getWalletPendingClassBalance, getWalletWithdrawableBalance } from '../../utils/wallet'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const [balance, withdrawableBalance, pendingClassBalance] = await Promise.all([
    getWalletBalance(user.id),
    getWalletWithdrawableBalance(user.id),
    getWalletPendingClassBalance(user.id),
  ])
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
    prisma.userWithdrawRequest.findMany({
      where: { userId: user.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.userWithdrawRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  return {
    balance,
    withdrawableBalance,
    pendingClassBalance,
    sheba: dbUser?.sheba || null,
    transactions: wallet?.transactions || [],
    pendingWithdraws,
    withdraws: recentWithdraws,
  }
})
