import { rialsToToman } from './payments.ts'

/**
 * Liara first shipped toman×10 to SEP around 16:52 +0330 on 17 Aug 2026
 * (`9258d8e`). Paid SEP rows created before this were sent as rials with no ×10.
 */
export const PRE_RIAL_IPG_CUTOFF = new Date('2026-08-17T13:22:00.000Z')

export type PreRialIpgCandidate = {
  status: string
  method: string
  provider: string
  createdAt: Date | string
  amount: number
  metadataJson?: string | null
}

function parseMeta(raw?: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {}
  }
}

/** Paid SEP IPG from before ×10, not already rewritten to true toman. */
export function isPreRialIpgPayment(payment: PreRialIpgCandidate): boolean {
  if (payment.status !== 'PAID') return false
  if (payment.method !== 'IPG') return false
  if (payment.provider !== 'sep') return false
  if (!Number.isFinite(payment.amount) || payment.amount < 10) return false
  if (!(new Date(payment.createdAt) < PRE_RIAL_IPG_CUTOFF)) return false
  const meta = parseMeta(payment.metadataJson)
  if (meta.preRialIpgCorrected === true) return false
  return true
}

/** Stored integer was sent to SEP as rials; product unit is toman. */
export function correctedTomanFromPreRialAmount(stored: number): number {
  const toman = rialsToToman(stored)
  return Math.max(1, toman)
}
