import { describe, expect, it } from 'vitest'
import { buildClubCommissionEffective } from './clubCommissionEffective.ts'

describe('buildClubCommissionEffective', () => {
  it('club explicit 0 stays 0 when platform is nonzero', () => {
    const row = buildClubCommissionEffective(0, 1000)
    expect(row.effectiveBps).toBe(0)
    expect(row.clubPromoZero).toBe(true)
  })

  it('club null inherits platform 0', () => {
    const row = buildClubCommissionEffective(null, 0)
    expect(row.effectiveBps).toBe(0)
    expect(row.clubBps).toBeNull()
    expect(row.clubPromoZero).toBe(false)
  })

  it('club null inherits platform nonzero', () => {
    const row = buildClubCommissionEffective(null, 1000)
    expect(row.effectiveBps).toBe(1000)
  })

  it('club nonzero override wins over platform default', () => {
    const row = buildClubCommissionEffective(500, 1000)
    expect(row.effectiveBps).toBe(500)
  })
})
