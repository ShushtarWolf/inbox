import { describe, expect, it } from 'vitest'
import { parseDeskPercent, resolveDeskCharge } from './deskCharge'

describe('resolveDeskCharge', () => {
  it('passes through a full-price subtotal', () => {
    expect(resolveDeskCharge({ subtotal: 2_850_000 })).toEqual({
      amount: 2_850_000,
      discountAmount: 0,
      percent: 0,
      complimentary: false,
    })
  })

  it('applies a desk percent without a code', () => {
    expect(resolveDeskCharge({ subtotal: 1_000_000, percent: 20 })).toEqual({
      amount: 800_000,
      discountAmount: 200_000,
      percent: 20,
      complimentary: false,
    })
  })

  it('zeros the charge for complimentary even if a percent is set', () => {
    expect(resolveDeskCharge({ subtotal: 1_200_000, percent: 10, complimentary: true })).toEqual({
      amount: 0,
      discountAmount: 1_200_000,
      percent: 100,
      complimentary: true,
    })
  })
})

describe('parseDeskPercent', () => {
  it('treats an empty desk-percent field as 0% (not 100%)', () => {
    expect(parseDeskPercent('')).toBe(0)
    expect(parseDeskPercent('   ')).toBe(0)
    expect(parseDeskPercent(undefined)).toBe(0)
    expect(parseDeskPercent(null)).toBe(0)
  })

  it('reads Persian / Arabic-Indic digits and clamps to 0–100', () => {
    expect(parseDeskPercent('۲۰')).toBe(20)
    expect(parseDeskPercent('٣٠')).toBe(30)
    expect(parseDeskPercent('15%')).toBe(15)
    expect(parseDeskPercent('250')).toBe(100)
    expect(parseDeskPercent('۰')).toBe(0)
  })
})

describe('desk pay confirm total (Behnaz 480,000 single slot)', () => {
  // Regression guard for the iPhone report where «جمع کل» looked like ۰ تومان:
  // the ۰ was the discount line (amount wrapped under its label on phones);
  // the real total sat below the fold. Default confirm state must charge in full.
  const confirmTotal = (subtotal: number, percentField: string, codePercent?: number) =>
    resolveDeskCharge({ subtotal, percent: codePercent ?? parseDeskPercent(percentField) })

  it('charges the full slot price when no code and no percent are entered', () => {
    expect(confirmTotal(480_000, '')).toEqual({
      amount: 480_000,
      discountAmount: 0,
      percent: 0,
      complimentary: false,
    })
  })

  it('only reaches 0 when the owner explicitly enters 100', () => {
    expect(confirmTotal(480_000, '۱۰۰').amount).toBe(0)
    expect(confirmTotal(480_000, '0').amount).toBe(480_000)
  })

  it('prefers an applied code percent over the free-text field', () => {
    expect(confirmTotal(480_000, '', 25).amount).toBe(360_000)
  })
})
