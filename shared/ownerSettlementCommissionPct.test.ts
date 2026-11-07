import { describe, expect, it } from 'vitest'
import { ownerSettlementCommissionPct } from './ownerSettlementCommissionPct.ts'

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
