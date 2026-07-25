import { describe, expect, it } from 'vitest'
import {
  isWalletTopUpPayment,
  normalizeWalletTopUpAmount,
  WALLET_TOPUP_MAX_IRR,
  WALLET_TOPUP_MIN_IRR,
} from './walletTopUp'

describe('normalizeWalletTopUpAmount', () => {
  it('accepts amounts in range', () => {
    expect(normalizeWalletTopUpAmount(200_000)).toBe(200_000)
    expect(normalizeWalletTopUpAmount(String(WALLET_TOPUP_MIN_IRR))).toBe(WALLET_TOPUP_MIN_IRR)
  })

  it('rejects out of range or invalid', () => {
    expect(normalizeWalletTopUpAmount(WALLET_TOPUP_MIN_IRR - 1)).toBeNull()
    expect(normalizeWalletTopUpAmount(WALLET_TOPUP_MAX_IRR + 1)).toBeNull()
    expect(normalizeWalletTopUpAmount('abc')).toBeNull()
    expect(normalizeWalletTopUpAmount(NaN)).toBeNull()
  })
})

describe('isWalletTopUpPayment', () => {
  it('detects topup purpose', () => {
    expect(isWalletTopUpPayment({ purpose: 'topup' })).toBe(true)
    expect(isWalletTopUpPayment({ purpose: 'booking' })).toBe(false)
  })
})
