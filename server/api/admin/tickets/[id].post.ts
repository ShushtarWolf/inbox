import { requireAdminSecret } from '../../../utils/adminAuth'
import { normalizeTicketBody, TICKET_REPLY_MAX, type SupportTicketStatus } from '#shared/supportTicket.ts'

const STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED']

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const body = await readBody<{ action?: 'reply' | 'status'; note?: string; status?: SupportTicketStatus }>(event)
  const existing = await prisma.supportTicket.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Ticket not found' })

  if (body.action === 'reply') {
    const note = normalizeTicketBody(body.note, TICKET_REPLY_MAX)
    if (!note) throw createError({ statusCode: 400, statusMessage: 'Invalid ticket body' })
    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: {
        status: existing.status === 'RESOLVED' ? 'RESOLVED' : 'IN_PROGRESS',
        messages: { create: { body: note, fromAdmin: true } },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })
    return { ok: true, ticket }
  }

  const nextStatus = body.status
  if (!nextStatus || !STATUSES.includes(nextStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
  }

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: {
      status: nextStatus,
      resolvedAt: nextStatus === 'RESOLVED' ? new Date() : null,
    },
  })
  return { ok: true, ticket }
})
