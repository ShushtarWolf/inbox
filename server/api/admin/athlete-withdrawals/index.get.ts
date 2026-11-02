import { requireAdminSecret } from '../../../utils/adminAuth'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : 'PENDING'
  const q = typeof query.q === 'string' ? query.q.trim() : ''

  const requests = await prisma.userWithdrawRequest.findMany({
    where: {
      ...(status === 'ALL' ? {} : { status: status as 'PENDING' | 'PAID' | 'REJECTED' }),
      ...(q
        ? {
            user: {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { nameFamily: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, nameFamily: true, email: true, phone: true, sheba: true } },
      paymentDocuments: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, url: true, fileName: true, contentType: true, createdAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return { requests }
})
