import { describe, expect, it } from 'vitest'
import { evaluateClubReadiness, minCourtPrice } from './clubReadiness'

const base = {
  status: 'ACTIVE',
  openHour: 8,
  closeHour: 22,
  nameFa: 'باشگاه',
  nameEn: 'Club',
  addressFa: 'تهران',
  courts: [{ price: 600000 }],
  owner: { lastLoginAt: new Date(), disabledAt: null },
}

describe('evaluateClubReadiness', () => {
  it('marks a fully configured club bookable', () => {
    const result = evaluateClubReadiness(base)
    expect(result.bookable).toBe(true)
    expect(result.checks.every((check) => check.ok)).toBe(true)
  })

  it('requires ACTIVE status and at least one priced court', () => {
    expect(evaluateClubReadiness({ ...base, status: 'PENDING' }).bookable).toBe(false)
    expect(evaluateClubReadiness({ ...base, courts: [] }).bookable).toBe(false)
    expect(evaluateClubReadiness({ ...base, courts: [{ price: 0 }] }).bookable).toBe(false)
  })

  it('allows bookable without owner login (ops-only check)', () => {
    const result = evaluateClubReadiness({ ...base, owner: { lastLoginAt: null } })
    expect(result.bookable).toBe(true)
    expect(result.checks.find((check) => check.id === 'ownerLogin')?.ok).toBe(false)
  })

  it('rejects invalid hours', () => {
    expect(evaluateClubReadiness({ ...base, openHour: 22, closeHour: 8 }).bookable).toBe(false)
  })
})

describe('minCourtPrice', () => {
  it('returns the lowest positive court price', () => {
    expect(minCourtPrice([{ price: 800000 }, { price: 500000 }, { price: 0 }])).toBe(500000)
    expect(minCourtPrice([])).toBeNull()
  })
})
