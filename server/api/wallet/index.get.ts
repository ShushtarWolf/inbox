import { getWalletBalance } from '../../utils/wallet'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const balance = await getWalletBalance(user.id)
  const wallet = await prisma.wallet.findUnique({
    where: { userId: user.id },
    include: {
      transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })
  return { balance, transactions: wallet?.transactions || [] }
})
