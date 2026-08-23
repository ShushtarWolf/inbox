import { clampDiscountPercent } from '#shared/discountCode.ts'

function parseOptionalDate(raw: string | null | undefined, allowNull: boolean): Date | null | undefined {
  if (raw === undefined) return undefined
  if (raw == null || String(raw).trim() === '') {
    if (!allowNull) throw createError({ statusCode: 400, statusMessage: 'Invalid date' })
    return null
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid date' })
  }
  return d
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing discount id' })

  const existing = await prisma.discountCode.findFirst({
    where: { id, clubId: club.id },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Discount code not found' })

  const body = await readBody<{
    percent?: number
    labelFa?: string | null
    labelEn?: string | null
    maxRedemptions?: number | null
    startsAt?: string | null
    endsAt?: string | null
    active?: boolean
  }>(event)

  const data: {
    percent?: number
    labelFa?: string | null
    labelEn?: string | null
    maxRedemptions?: number | null
    startsAt?: Date | null
    endsAt?: Date | null
    active?: boolean
  } = {}

  if (body.percent !== undefined) {
    const percent = clampDiscountPercent(Number(body.percent))
    if (percent < 1) {
      throw createError({ statusCode: 400, statusMessage: 'Percent must be 1–100' })
    }
    data.percent = percent
  }
  if (body.labelFa !== undefined) data.labelFa = body.labelFa?.trim() || null
  if (body.labelEn !== undefined) data.labelEn = body.labelEn?.trim() || null
  if (body.active !== undefined) data.active = Boolean(body.active)

  if (body.maxRedemptions !== undefined) {
    if (body.maxRedemptions == null) {
      data.maxRedemptions = null
    } else {
      const n = Math.round(Number(body.maxRedemptions))
      if (!Number.isFinite(n) || n < 1) {
        throw createError({ statusCode: 400, statusMessage: 'maxRedemptions must be >= 1' })
      }
      if (n < existing.redemptionCount) {
        throw createError({
          statusCode: 400,
          statusMessage: 'maxRedemptions cannot be below redemptions already used',
        })
      }
      data.maxRedemptions = Math.min(1_000_000, n)
    }
  }

  if (body.startsAt !== undefined) {
    data.startsAt = parseOptionalDate(body.startsAt, true) ?? null
  }
  if (body.endsAt !== undefined) {
    data.endsAt = parseOptionalDate(body.endsAt, true) ?? null
  }

  const startsAt = data.startsAt !== undefined ? data.startsAt : existing.startsAt
  const endsAt = data.endsAt !== undefined ? data.endsAt : existing.endsAt
  if (startsAt && endsAt && endsAt < startsAt) {
    throw createError({ statusCode: 400, statusMessage: 'endsAt must be after startsAt' })
  }

  return prisma.discountCode.update({ where: { id }, data })
})
