import { requireAdminSecret } from '../../../utils/adminAuth'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : 'PENDING'

  const requests = await prisma.shebaChangeRequest.findMany({
    where: status === 'ALL' ? undefined : { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' },
    include: {
      club: { select: { id: true, slug: true, nameFa: true, sheba: true } },
      user: { select: { id: true, name: true, email: true, phone: true, sheba: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return {
    requests: requests.map((row) => ({
      id: row.id,
      subject: row.subject,
      proposedSheba: row.proposedSheba,
      previousSheba: row.previousSheba,
      status: row.status,
      adminNote: row.adminNote,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      club: row.club,
      user: row.user,
    })),
  }
})
