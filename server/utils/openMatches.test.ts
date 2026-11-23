import { describe, expect, it } from 'vitest'
import { splitSlotPriceToman } from '#shared/openMatch.ts'

describe('openMatch server helpers', () => {
  it('split shares always equal slot total', () => {
    for (const total of [500_000, 600_001, 399_999]) {
      for (const players of [2, 3, 4]) {
        const shares = splitSlotPriceToman(total, players)
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })
})