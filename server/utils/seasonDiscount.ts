import { resolveDeskCharge } from '#shared/deskCharge.ts'
import {
  assertDiscountUsable,
  discountPaymentMetadata,
  findDiscountCodeByInput,
  redeemDiscountCode,
  resolveDiscountForBooking,
} from './discountCodes'
import type { Prisma } from '@prisma/client'

export type SeasonSeriesCharge = {
  subtotalBeforeDiscount: number
  chargedTotal: number
  discountAmount: number
  paymentMetadata: Record<string, unknown> | null
  redeemDiscountId: string | null
}

export async function resolveSeasonSeriesCharge(opts: {
  clubId: string
  subtotal: number
  athleteMode: boolean
  discountCode?: string | null
  deskDiscountPercent?: number | null
  complimentary?: boolean
  userId?: string | null
}): Promise<SeasonSeriesCharge> {
  const subtotalBeforeDiscount = Math.max(0, Math.round(Number(opts.subtotal) || 0))
  const empty: SeasonSeriesCharge = {
    subtotalBeforeDiscount,
    chargedTotal: subtotalBeforeDiscount,
    discountAmount: 0,
    paymentMetadata: null,
    redeemDiscountId: null,
  }

  if (opts.athleteMode) {
    const code = opts.discountCode
    if (!code) return empty
    const discount = await resolveDiscountForBooking({
      code,
      clubId: opts.clubId,
      subtotal: subtotalBeforeDiscount,
      userId: opts.userId,
    })
    if (!discount) return empty
    return {
      subtotalBeforeDiscount,
      chargedTotal: discount.total,
      discountAmount: discount.discountAmount,
      paymentMetadata: discountPaymentMetadata(discount),
      redeemDiscountId: discount.id,
    }
  }

  if (opts.complimentary) {
    const charge = resolveDeskCharge({ subtotal: subtotalBeforeDiscount, complimentary: true })
    return {
      subtotalBeforeDiscount,
      chargedTotal: charge.amount,
      discountAmount: charge.discountAmount,
      paymentMetadata: { complimentary: true, discountAmount: charge.discountAmount },
      redeemDiscountId: null,
    }
  }

  if (opts.discountCode) {
    const discountRow = await findDiscountCodeByInput(opts.discountCode)
    if (!discountRow) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid discount code' })
    }
    assertDiscountUsable(discountRow, opts.clubId)
    const charge = resolveDeskCharge({ subtotal: subtotalBeforeDiscount, percent: discountRow.percent })
    return {
      subtotalBeforeDiscount,
      chargedTotal: charge.amount,
      discountAmount: charge.discountAmount,
      paymentMetadata: {
        discountCode: discountRow.code,
        discountPercent: discountRow.percent,
        discountAmount: charge.discountAmount,
        subtotalBeforeDiscount,
      },
      redeemDiscountId: null,
    }
  }

  const charge = resolveDeskCharge({
    subtotal: subtotalBeforeDiscount,
    percent: Number(opts.deskDiscountPercent) || 0,
  })
  if (charge.discountAmount <= 0) return empty
  return {
    subtotalBeforeDiscount,
    chargedTotal: charge.amount,
    discountAmount: charge.discountAmount,
    paymentMetadata: {
      deskDiscountPercent: charge.percent,
      discountAmount: charge.discountAmount,
      subtotalBeforeDiscount,
    },
    redeemDiscountId: null,
  }
}

/** Per-session amount when owner pays each line vs one primary checkout. */
export function seasonSessionPaymentAmount(opts: {
  groupedOnPrimary: boolean
  isPrimary: boolean
  sessionPrice: number
  chargedSeriesTotal: number
  remainingDiscount: number
}): { amount: number; remainingDiscount: number } {
  if (opts.groupedOnPrimary) {
    return {
      amount: opts.isPrimary ? opts.chargedSeriesTotal : 0,
      remainingDiscount: opts.remainingDiscount,
    }
  }
  const cut = Math.min(opts.sessionPrice, opts.remainingDiscount)
  const remainingDiscount = opts.remainingDiscount - cut
  return { amount: opts.sessionPrice - cut, remainingDiscount }
}

export async function redeemSeasonAthleteDiscount(
  tx: Prisma.TransactionClient,
  discountId: string | null,
) {
  if (!discountId) return
  await redeemDiscountCode(tx, discountId)
}
