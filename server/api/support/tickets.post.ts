import {
  isPlausibleEmail,
  normalizeOptionalLine,
  normalizeTicketBody,
  type SupportTicketSource,
} from '#shared/supportTicket.ts'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'support:ticket')

  const body = await readBody<{
    body?: string
    name?: string
    email?: string
    phone?: string
    pageUrl?: string
    bookingId?: string
    website?: string
  }>(event)

  // Honeypot: silently accept so bots do not adapt.
  if (normalizeOptionalLine(body?.website, 200)) {
    return { ok: true, ticket: null }
  }

  const text = normalizeTicketBody(body?.body)
  if (!text) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid ticket body' })
  }

  const name = normalizeOptionalLine(body?.name, 120)
  const emailRaw = normalizeOptionalLine(body?.email, 160)
  if (emailRaw && !isPlausibleEmail(emailRaw)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email' })
  }
  const phone = normalizeOptionalLine(body?.phone, 32)
  const pageUrl = normalizeOptionalLine(body?.pageUrl, 400)
  const bookingId = normalizeOptionalLine(body?.bookingId, 40)

  const session = await getUserSession(event)
  let userId: string | null = session?.user?.id || null
  let clubId: string | null = null
  let source: SupportTicketSource = 'CONTACT'
  let email = emailRaw
  let displayName = name

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, name: true, phone: true, disabledAt: true },
    })
    if (!user || user.disabledAt) {
      userId = null
    } else {
      email = email || user.email
      displayName = displayName || user.name
      if (user.role === 'CLUB_ADMIN') {
        source = 'OWNER'
        const membership = await prisma.staffMembership.findFirst({
          where: { userId: user.id, active: true },
          select: { clubId: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        })
        clubId = membership?.clubId || null
      } else {
        source = 'ATHLETE'
      }
    }
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      body: text,
      name: displayName,
      email,
      phone: phone || null,
      pageUrl,
      bookingId,
      source,
      userId,
      clubId,
      messages: {
        create: { body: text, fromAdmin: false },
      },
    },
    select: { id: true, status: true, createdAt: true },
  })

  return { ok: true, ticket }
})
