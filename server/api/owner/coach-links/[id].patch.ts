import { clampDiscountPercent } from '#shared/discountCode.ts'

const ALLOWED_STATUS = ['PENDING', 'ACTIVE', 'BLOCKED'] as const

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const { club } = await requireOwnerClub(event, 'team')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const body = await readBody<{ status?: string; courtDiscountPercent?: number }>(event)

  const link = await prisma.coachClubLink.findFirst({ where: { id, clubId: club.id } })
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Link not found' })

  const status = body.status && ALLOWED_STATUS.includes(body.status as (typeof ALLOWED_STATUS)[number])
    ? (body.status as (typeof ALLOWED_STATUS)[number])
    : undefined

  const updated = await prisma.coachClubLink.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(body.courtDiscountPercent !== undefined
        ? { courtDiscountPercent: clampDiscountPercent(body.courtDiscountPercent) }
        : {}),
    },
  })

  return {
    id: updated.id,
    status: updated.status,
    courtDiscountPercent: updated.courtDiscountPercent,
  }
})
