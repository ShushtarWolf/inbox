import { normalizeTicketBody } from '#shared/supportTicket.ts'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'support:ticket')
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const body = await readBody<{ body?: string }>(event)
  const text = normalizeTicketBody(body?.body)
  if (!text) throw createError({ statusCode: 400, statusMessage: 'Invalid ticket body' })

  const existing = await prisma.supportTicket.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Ticket not found' })

  const reopening = existing.status === 'RESOLVED'
  const ticket = await prisma.supportTicket.update({
    where: { id: existing.id },
    data: {
      status: reopening ? 'OPEN' : existing.status,
      resolvedAt: reopening ? null : undefined,
      messages: { create: { body: text, fromAdmin: false } },
    },
    select: { id: true, status: true },
  })

  return { ok: true, ticket }
})
