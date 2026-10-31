import { serializeApplicationForOwner } from '../../../utils/discountMemberships'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const query = getQuery(event)
  const statusRaw = typeof query.status === 'string' ? query.status.toUpperCase() : 'PENDING'
  const status = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(statusRaw)
    ? statusRaw
    : 'PENDING'

  const rows = await prisma.discountApplication.findMany({
    where: {
      clubId: club.id,
      ...(status === 'ALL' ? {} : { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' }),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { id: true, name: true, phone: true } },
      program: { select: { id: true, titleFa: true, titleEn: true, percent: true } },
    },
  })

  return rows.map(serializeApplicationForOwner)
})
