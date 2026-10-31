import { clampDiscountPercent } from '#shared/discountCode.ts'

function parseValidityMonths(raw: number | null | undefined): number | null | undefined {
  if (raw === undefined) return undefined
  if (raw == null) return null
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(120, n)
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing program id' })

  const existing = await prisma.discountProgram.findFirst({
    where: { id, clubId: club.id },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Program not found' })

  const body = await readBody<{
    titleFa?: string
    titleEn?: string | null
    percent?: number
    instructionsFa?: string | null
    instructionsEn?: string | null
    validityMonths?: number | null
    active?: boolean
  }>(event)

  const data: {
    titleFa?: string
    titleEn?: string | null
    percent?: number
    instructionsFa?: string | null
    instructionsEn?: string | null
    validityMonths?: number | null
    active?: boolean
  } = {}

  if (body?.titleFa !== undefined) {
    const titleFa = body.titleFa.trim()
    if (titleFa.length < 2 || titleFa.length > 80) {
      throw createError({ statusCode: 400, statusMessage: 'titleFa required (2–80 chars)' })
    }
    data.titleFa = titleFa
  }
  if (body?.titleEn !== undefined) data.titleEn = body.titleEn?.trim() || null
  if (body?.percent !== undefined) {
    const percent = clampDiscountPercent(Number(body.percent))
    if (percent < 1) throw createError({ statusCode: 400, statusMessage: 'Percent must be 1–100' })
    data.percent = percent
  }
  if (body?.instructionsFa !== undefined) data.instructionsFa = body.instructionsFa?.trim() || null
  if (body?.instructionsEn !== undefined) data.instructionsEn = body.instructionsEn?.trim() || null
  const validity = parseValidityMonths(body?.validityMonths)
  if (validity !== undefined) data.validityMonths = validity
  if (body?.active !== undefined) data.active = Boolean(body.active)

  return prisma.discountProgram.update({ where: { id }, data })
})
