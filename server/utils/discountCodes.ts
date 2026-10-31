import type { DiscountCode, Prisma } from '@prisma/client'
import {
  applyDiscountPercent,
  evaluateDiscountCodeWindow,
  normalizeDiscountCode,
} from '#shared/discountCode.ts'
import { membershipDiscountCode } from '#shared/discountMembership.ts'
import { findBestActiveMembership } from './discountMemberships'

export type ResolvedDiscount = {
  id: string
  code: string
  percent: number
  labelFa: string | null
  labelEn: string | null
  discountAmount: number
  total: number
  subtotal: number
  /** Promo code vs verified club membership. Only codes are redeemed. */
  kind: 'code' | 'membership'
}

export async function findDiscountCodeByInput(raw: string | null | undefined) {
  const code = normalizeDiscountCode(raw)
  if (!code) return null
  return prisma.discountCode.findUnique({ where: { code } })
}

export function assertDiscountUsable(
  row: DiscountCode,
  bookingClubId: string | null | undefined,
  redeemingUserId?: string | null,
  now = new Date(),
) {
  const verdict = evaluateDiscountCodeWindow({
    active: row.active,
    clubId: row.clubId,
    bookingClubId,
    boundUserId: row.boundUserId,
    redeemingUserId,
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
    wrong_user: 'Discount code not valid for this account',
  } as const)[verdict.reason]
  throw createError({ statusCode: 400, statusMessage })
}

function toResolved(
  opts: {
    id: string
    code: string
    percent: number
    labelFa: string | null
    labelEn: string | null
    kind: 'code' | 'membership'
  },
  subtotal: number,
): ResolvedDiscount {
  const safeSubtotal = Math.max(0, Math.round(subtotal) || 0)
  const { discountAmount, total } = applyDiscountPercent(safeSubtotal, opts.percent)
  return {
    id: opts.id,
    code: opts.code,
    percent: opts.percent,
    labelFa: opts.labelFa,
    labelEn: opts.labelEn,
    discountAmount,
    total,
    subtotal: safeSubtotal,
    kind: opts.kind,
  }
}

export async function resolveDiscountForBooking(opts: {
  code?: string | null
  clubId: string
  subtotal: number
  userId?: string | null
  now?: Date
}): Promise<ResolvedDiscount | null> {
  const code = normalizeDiscountCode(opts.code)
  let fromCode: ResolvedDiscount | null = null
  if (code) {
    const row = await findDiscountCodeByInput(code)
    if (!row) throw createError({ statusCode: 400, statusMessage: 'Invalid discount code' })
    assertDiscountUsable(row, opts.clubId, opts.userId, opts.now)
    fromCode = toResolved({
      id: row.id,
      code: row.code,
      percent: row.percent,
      labelFa: row.labelFa,
      labelEn: row.labelEn,
      kind: 'code',
    }, opts.subtotal)
  }

  let fromMembership: ResolvedDiscount | null = null
  if (opts.userId) {
    const membership = await findBestActiveMembership({
      clubId: opts.clubId,
      userId: opts.userId,
      now: opts.now,
    })
    if (membership) {
      fromMembership = toResolved({
        id: membership.id,
        code: membershipDiscountCode(membership.id),
        percent: membership.percent,
        labelFa: membership.labelFa,
        labelEn: membership.labelEn || null,
        kind: 'membership',
      }, opts.subtotal)
    }
  }

  if (!fromCode && !fromMembership) return null
  if (!fromCode) return fromMembership
  if (!fromMembership) return fromCode
  // Better (or equal) membership wins so limited promo codes are not burned for no gain.
  if (fromMembership.percent >= fromCode.percent) return fromMembership
  return fromCode
}

export async function redeemDiscountCode(
  tx: Prisma.TransactionClient,
  discountId: string,
) {
  const row = await tx.discountCode.findUnique({ where: { id: discountId } })
  if (!row) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid discount code' })
  }
  const where: Prisma.DiscountCodeWhereInput = row.maxRedemptions == null
    ? { id: discountId }
    : { id: discountId, redemptionCount: { lt: row.maxRedemptions } }
  const claimed = await tx.discountCode.updateMany({
    where,
    data: { redemptionCount: { increment: 1 } },
  })
  if (claimed.count !== 1) {
    throw createError({ statusCode: 400, statusMessage: 'Discount code exhausted' })
  }
}

export function discountPaymentMetadata(discount: ResolvedDiscount) {
  return {
    discountCode: discount.code,
    discountPercent: discount.percent,
    discountAmount: discount.discountAmount,
    subtotalBeforeDiscount: discount.subtotal,
  }
}

/** Single-use, club-scoped, athlete-bound prize code for competition winners. */
export async function createCompetitionPrizeDiscountCode(
  tx: Prisma.TransactionClient,
  opts: {
    competitionId: string
    placement: number
    percent: number
    clubId: string
    athleteId: string
    title: string
    endsAt: Date
  },
) {
  const { randomBytes } = await import('node:crypto')
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = randomBytes(4).toString('hex').toUpperCase()
    const code = normalizeDiscountCode(`CP${opts.placement}${suffix}`)
    try {
      return await tx.discountCode.create({
        data: {
          code,
          percent: opts.percent,
          labelFa: `جایزه رتبه ${opts.placement} — ${opts.title}`,
          labelEn: `Prize rank ${opts.placement} — ${opts.title}`,
          maxRedemptions: 1,
          active: true,
          clubId: opts.clubId,
          boundUserId: opts.athleteId,
          endsAt: opts.endsAt,
        },
      })
    } catch (err: unknown) {
      const codeName = typeof err === 'object' && err && 'code' in err
        ? String((err as { code?: string }).code)
        : ''
      if (codeName === 'P2002' && attempt < 4) continue
      throw err
    }
  }
  throw createError({ statusCode: 500, statusMessage: 'Failed to generate prize discount code' })
}
