import { requireAdminSecret } from '../../../utils/adminAuth'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : 'PENDING'

  const requests = await prisma.userWithdrawRequest.findMany({
    where: status === 'ALL' ? undefined : { status: status as 'PENDING' | 'PAID' | 'REJECTED' },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, sheba: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return { requests }
})
