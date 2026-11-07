import { resolveClubCommissionBps } from './settlement.ts'

/** Owner/admin display: effective bps plus explicit club override vs platform default. */
export type ClubCommissionEffective = {
  /** Rate used for new settlements (club override, else platform default). */
  effectiveBps: number
  /** Admin-set club override; null = inherit platform default. */
  clubBps: number | null
  /** Platform default from admin DB (not legacy env). */
  platformDefaultBps: number
  /** True when club.commissionBps is 0 (promo / partner — not inherited default). */
  clubPromoZero: boolean
}

export function buildClubCommissionEffective(
  clubCommissionBps: number | null | undefined,
  platformDefaultBps: number,
): ClubCommissionEffective {
  return {
    effectiveBps: resolveClubCommissionBps(clubCommissionBps, platformDefaultBps),
    clubBps: clubCommissionBps ?? null,
    platformDefaultBps,
    clubPromoZero: clubCommissionBps === 0,
  }
}
