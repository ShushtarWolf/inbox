import { clampDiscountPercent } from '#shared/discountCode.ts'

const ALLOWED_STATUS = ['PENDING', 'ACTIVE', 'BLOCKED'] as const

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const { club } = await requireOwnerClub(event, 'team')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const body = await readBody<{ status?: string; courtDiscountPercent?: number }>(event)

  const link = await prisma.coachClubLink.findFirst({
    where: { id, clubId: club.id },
    include: { coach: { select: { id: true, approvalStatus: true, clubId: true } } },
  })
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Link not found' })

  const status = body.status && ALLOWED_STATUS.includes(body.status as (typeof ALLOWED_STATUS)[number])
    ? (body.status as (typeof ALLOWED_STATUS)[number])
    : undefined

  if (status === 'ACTIVE' && link.coach.approvalStatus !== 'APPROVED') {
    throw createError({ statusCode: 403, statusMessage: 'COACH_NOT_APPROVED' })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.coachClubLink.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(body.courtDiscountPercent !== undefined
          ? { courtDiscountPercent: clampDiscountPercent(body.courtDiscountPercent) }
          : {}),
      },
    })

    // Primary display club must stay an ACTIVE affiliation.
    if (next.status !== 'ACTIVE') {
      await tx.coach.updateMany({
        where: { id: link.coachId, clubId: link.clubId },
        data: { clubId: null },
      })
    }
    else if (status === 'ACTIVE') {
      // First accepted club becomes primary when the coach has none yet.
      await tx.coach.updateMany({
        where: { id: link.coachId, clubId: null },
        data: { clubId: link.clubId },
      })
    }

    return next
  })

  return {
    id: updated.id,
    status: updated.status,
    courtDiscountPercent: updated.courtDiscountPercent,
  }
})
