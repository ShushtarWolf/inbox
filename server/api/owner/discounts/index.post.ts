import {
  clampDiscountPercent,
  normalizeDiscountCode,
} from '#shared/discountCode.ts'

const CODE_RE = /^[A-Z0-9]{3,32}$/

function parseOptionalDate(raw: string | null | undefined): Date | null {
  if (raw == null || String(raw).trim() === '') return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid date' })
  }
  return d
}

function parseOptionalMaxRedemptions(raw: number | null | undefined): number | null {
  if (raw == null || raw === undefined) return null
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 1) {
    throw createError({ statusCode: 400, statusMessage: 'maxRedemptions must be >= 1' })
  }
  return Math.min(1_000_000, n)
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const body = await readBody<{
    code?: string
    percent?: number
    labelFa?: string | null
    labelEn?: string | null
    maxRedemptions?: number | null
    startsAt?: string | null
    endsAt?: string | null
    active?: boolean
  }>(event)

  const code = normalizeDiscountCode(body?.code)
  if (!CODE_RE.test(code)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Code must be 3–32 letters or digits',
    })
  }

  const percent = clampDiscountPercent(Number(body?.percent))
  if (percent < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Percent must be 1–100' })
  }

  const startsAt = parseOptionalDate(body?.startsAt)
  const endsAt = parseOptionalDate(body?.endsAt)
  if (startsAt && endsAt && endsAt < startsAt) {
    throw createError({ statusCode: 400, statusMessage: 'endsAt must be after startsAt' })
  }

  const labelFa = body?.labelFa?.trim() || null
  const labelEn = body?.labelEn?.trim() || null
  const maxRedemptions = parseOptionalMaxRedemptions(body?.maxRedemptions)
  const active = body?.active !== false

  try {
    return await prisma.discountCode.create({
      data: {
        code,
        percent,
        labelFa,
        labelEn,
        maxRedemptions,
        startsAt,
        endsAt,
        active,
        clubId: club.id,
      },
    })
  } catch (err: unknown) {
    const codeName = typeof err === 'object' && err && 'code' in err
      ? String((err as { code?: string }).code)
      : ''
    if (codeName === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Discount code already exists' })
    }
    throw err
  }
})
