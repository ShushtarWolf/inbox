import { describe, expect, it } from 'vitest'
import {
  canSplitPayWithWallet,
  normalizeUseWallet,
  readSplitPayMeta,
  splitPayParts,
} from './splitPay.ts'

describe('splitPay', () => {
  it('normalizes useWallet modes', () => {
    expect(normalizeUseWallet(true)).toBe('full')
    expect(normalizeUseWallet('full')).toBe('full')
    expect(normalizeUseWallet('partial')).toBe('partial')
    expect(normalizeUseWallet(false)).toBe(false)
  })

  it('splits balance under price', () => {
    expect(canSplitPayWithWallet(40_000, 100_000)).toBe(true)
    expect(canSplitPayWithWallet(100_000, 100_000)).toBe(false)
    expect(splitPayParts(40_000, 100_000)).toEqual({ walletPart: 40_000, ipgPart: 60_000 })
  })

  it('reads split metadata', () => {
    expect(readSplitPayMeta({ splitPay: true, walletDebitAmount: 10, ipgChargeAmount: 20 })).toEqual({
      splitPay: true,
      walletDebitAmount: 10,
      splitFullAmount: 30,
    })
  })
})
