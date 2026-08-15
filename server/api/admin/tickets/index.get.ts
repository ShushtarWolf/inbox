import { requireAdminSecret } from '../../../utils/adminAuth'
import type { SupportTicketSource, SupportTicketStatus } from '#shared/supportTicket.ts'

const STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED']
const SOURCES: SupportTicketSource[] = ['CONTACT', 'ATHLETE', 'OWNER']

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : 'OPEN'
  const source = typeof query.source === 'string' ? query.source : 'ALL'
  const q = typeof query.q === 'string' ? query.q.trim() : ''

  const tickets = await prisma.supportTicket.findMany({
    where: {
      ...(STATUSES.includes(status as SupportTicketStatus) ? { status: status as SupportTicketStatus } : {}),
      ...(SOURCES.includes(source as SupportTicketSource) ? { source: source as SupportTicketSource } : {}),
      ...(q
        ? {
            OR: [
              { body: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { bookingId: { contains: q } },
              { id: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, phone: true } },
      club: { select: { id: true, slug: true, nameFa: true } },
      messages: { orderBy: { createdAt: 'asc' }, take: 40 },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return { tickets }
})
