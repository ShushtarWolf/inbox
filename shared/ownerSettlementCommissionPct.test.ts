import { describe, expect, it } from 'vitest'
import { ownerLedgerHasPastRate, ownerLedgerRowFee, ownerSettlementCommissionPct } from './ownerSettlementCommissionPct.ts'

describe('ownerSettlementCommissionPct', () => {
  it('returns null while settlement is loading without bps', () => {
    expect(ownerSettlementCommissionPct(undefined, true)).toBe(null)
  })

  it('shows explicit 0% from backend (not treated as missing)', () => {
    expect(ownerSettlementCommissionPct(0, false)).toBe(0)
  })

  it('maps bps to whole-percent display', () => {
    expect(ownerSettlementCommissionPct(750, false)).toBe(8)
    expect(ownerSettlementCommissionPct(1000, false)).toBe(10)
  })
})

describe('owner ledger row rate (rate at payment time)', () => {
  it('shows the row’s own 10% even when the club is now 0%', () => {
    expect(ownerLedgerRowFee({ gross: 500_000, commission: 50_000, commissionBps: 1000 }))
      .toEqual({ pct: 10, fee: 50_000, gross: 500_000 })
    expect(ownerLedgerHasPastRate([{ commissionBps: 1000 }, { commissionBps: 0 }], 0)).toBe(true)
  })

  it('no past-rate note when every row matches the current rate', () => {
    expect(ownerLedgerHasPastRate([{ commissionBps: 0 }], 0)).toBe(false)
    expect(ownerLedgerHasPastRate([], 0)).toBe(false)
    expect(ownerLedgerRowFee({ gross: 1, commission: 0 })).toBeNull()
  })
})
