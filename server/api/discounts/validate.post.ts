import { applyDiscountPercent, normalizeDiscountCode } from '#shared/discountCode.ts'
import { assertDiscountUsable, findDiscountCodeByInput } from '../../utils/discountCodes'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    code?: string
    clubId?: string
    clubSlug?: string
    subtotal?: number
  }>(event)

  const code = normalizeDiscountCode(body?.code)
  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Discount code required' })
  }

  let clubId = typeof body?.clubId === 'string' ? body.clubId : ''
  if (!clubId && typeof body?.clubSlug === 'string' && body.clubSlug) {
    const club = await prisma.club.findUnique({
      where: { slug: body.clubSlug },
      select: { id: true },
    })
    clubId = club?.id || ''
  }
  if (!clubId) {
    throw createError({ statusCode: 400, statusMessage: 'clubId required' })
  }

  const row = await findDiscountCodeByInput(code)
  if (!row) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid discount code' })
  }
  assertDiscountUsable(row, clubId)

  const subtotal = Math.max(0, Math.round(Number(body?.subtotal) || 0))
  const { discountAmount, total } = applyDiscountPercent(subtotal, row.percent)

  return {
    code: row.code,
    percent: row.percent,
    labelFa: row.labelFa,
    labelEn: row.labelEn,
    subtotal,
    discountAmount,
    total,
  }
})
