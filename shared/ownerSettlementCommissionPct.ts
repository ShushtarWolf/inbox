/**
 * Display-only mapping for owner finance commission line (UI tests).
 * Settlement API `commissionBps` is authoritative — do not resolve rates here.
 */
export function ownerSettlementCommissionPct(
  commissionBps: number | null | undefined,
  settlementPending: boolean,
): number | null {
  if (settlementPending && commissionBps == null) return null
  if (commissionBps == null || !Number.isFinite(Number(commissionBps))) return null
  return Math.round(Math.floor(Number(commissionBps)) / 100)
}
