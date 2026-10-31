import { clampDiscountPercent } from '#shared/discountCode.ts'

function parseValidityMonths(raw: number | null | undefined): number | null {
  if (raw == null || raw === undefined) return null
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(120, n)
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const body = await readBody<{
    titleFa?: string
    titleEn?: string | null
    percent?: number
    instructionsFa?: string | null
    instructionsEn?: string | null
    validityMonths?: number | null
    active?: boolean
  }>(event)

  const titleFa = body?.titleFa?.trim() || ''
  if (titleFa.length < 2 || titleFa.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'titleFa required (2–80 chars)' })
  }

  const percent = clampDiscountPercent(Number(body?.percent))
  if (percent < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Percent must be 1–100' })
  }

  return prisma.discountProgram.create({
    data: {
      clubId: club.id,
      titleFa,
      titleEn: body?.titleEn?.trim() || null,
      percent,
      instructionsFa: body?.instructionsFa?.trim() || null,
      instructionsEn: body?.instructionsEn?.trim() || null,
      validityMonths: parseValidityMonths(body?.validityMonths),
      active: body?.active !== false,
    },
  })
})
