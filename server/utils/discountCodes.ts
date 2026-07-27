import type { DiscountCode, Prisma } from '@prisma/client'
import {
  applyDiscountPercent,
  evaluateDiscountCodeWindow,
  normalizeDiscountCode,
} from '#shared/discountCode.ts'

export type ResolvedDiscount = {
  id: string
  code: string
  percent: number
  labelFa: string | null
  labelEn: string | null
  discountAmount: number
  total: number
  subtotal: number
}

export async function findDiscountCodeByInput(raw: string | null | undefined) {
  const code = normalizeDiscountCode(raw)
  if (!code) return null
  return prisma.discountCode.findUnique({ where: { code } })
}

export function assertDiscountUsable(
  row: DiscountCode,
  bookingClubId: string | null | undefined,
  now = new Date(),
) {
  const verdict = evaluateDiscountCodeWindow({
    active: row.active,
    clubId: row.clubId,
    bookingClubId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    now,
  })
  if (verdict.ok) return
  const statusMessage = ({
    missing: 'Discount code required',
    inactive: 'Discount code inactive',
    not_started: 'Discount code not started',
    expired: 'Discount code expired',
    exhausted: 'Discount code exhausted',
    wrong_club: 'Discount code not valid for this club',
  } as const)[verdict.reason]
  throw createError({ statusCode: 400, statusMessage })
}

export async function resolveDiscountForBooking(opts: {
  code?: string | null
  clubId: string
  subtotal: number
  now?: Date
}): Promise<ResolvedDiscount | null> {
  const code = normalizeDiscountCode(opts.code)
  if (!code) return null
  const row = await findDiscountCodeByInput(code)
  if (!row) throw createError({ statusCode: 400, statusMessage: 'Invalid discount code' })
  assertDiscountUsable(row, opts.clubId, opts.now)
  const { discountAmount, total } = applyDiscountPercent(opts.subtotal, row.percent)
  return {
    id: row.id,
    code: row.code,
    percent: row.percent,
    labelFa: row.labelFa,
    labelEn: row.labelEn,
    discountAmount,
    total,
    subtotal: Math.max(0, Math.round(opts.subtotal) || 0),
  }
}

export async function redeemDiscountCode(
  tx: Prisma.TransactionClient,
  discountId: string,
) {
  await tx.discountCode.update({
    where: { id: discountId },
    data: { redemptionCount: { increment: 1 } },
  })
}

export function discountPaymentMetadata(discount: ResolvedDiscount) {
  return {
    discountCode: discount.code,
    discountPercent: discount.percent,
    discountAmount: discount.discountAmount,
    subtotalBeforeDiscount: discount.subtotal,
  }
}
