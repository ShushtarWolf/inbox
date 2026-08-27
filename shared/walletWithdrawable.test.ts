import { describe, expect, it } from 'vitest'
import { computeWithdrawableBalance } from './walletTopUp'

describe('computeWithdrawableBalance', () => {
  it('returns 0 when balance is empty', () => {
    expect(computeWithdrawableBalance(0, 100_000, 0)).toBe(0)
  })

  it('blocks athlete-style credits (no settlement)', () => {
    expect(computeWithdrawableBalance(500_000, 0, 0)).toBe(0)
  })

  it('allows coach settlement net capped by balance', () => {
    expect(computeWithdrawableBalance(450_000, 500_000, -50_000)).toBe(450_000)
    expect(computeWithdrawableBalance(600_000, 500_000, 0)).toBe(500_000)
  })

  it('treats clawbacks as reducing withdrawable', () => {
    expect(computeWithdrawableBalance(400_000, 500_000, -200_000)).toBe(300_000)
  })
})
