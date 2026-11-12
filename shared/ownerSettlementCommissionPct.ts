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

export type OwnerLedgerRowRate = {
  gross?: number | null
  commission?: number | null
  commissionBps?: number | null
}

/** Each settlement row keeps the rate used when it was paid; show that, not today's rate. */
export function ownerLedgerRowFee(entry: OwnerLedgerRowRate): { pct: number; fee: number; gross: number } | null {
  const bps = entry.commissionBps
  if (bps == null || !Number.isFinite(Number(bps))) return null
  return {
    pct: Math.floor(Number(bps)) / 100,
    fee: Math.max(0, Math.floor(Number(entry.commission) || 0)),
    gross: Math.max(0, Math.floor(Number(entry.gross) || 0)),
  }
}

/** True when any listed settlement used a different rate than the club's current one. */
export function ownerLedgerHasPastRate(
  ledger: OwnerLedgerRowRate[] | null | undefined,
  currentBps: number | null | undefined,
): boolean {
  if (!ledger?.length || currentBps == null) return false
  return ledger.some((row) => row.commissionBps != null && Number(row.commissionBps) !== Number(currentBps))
}
