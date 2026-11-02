import { describe, expect, it } from 'vitest'
import { resolveWithdrawRail, totalUserWithdrawable } from './walletWithdrawRail.ts'

describe('resolveWithdrawRail', () => {
  it('uses athlete rail for non-coaches', () => {
    expect(resolveWithdrawRail({
      isCoach: false,
      amount: 100_000,
      coachWithdrawable: 0,
      athleteCashOut: 200_000,
    })).toBe('athlete')
  })

  it('prefers coach settlement when amount fits coach withdrawable', () => {
    expect(resolveWithdrawRail({
      isCoach: true,
      amount: 300_000,
      coachWithdrawable: 500_000,
      athleteCashOut: 200_000,
    })).toBe('coach')
  })

  it('falls back to athlete cash-out for coach+athlete when settlement is insufficient', () => {
    expect(resolveWithdrawRail({
      isCoach: true,
      amount: 150_000,
      coachWithdrawable: 0,
      athleteCashOut: 400_000,
    })).toBe('athlete')
  })

  it('returns null when neither rail can cover the amount', () => {
    expect(resolveWithdrawRail({
      isCoach: true,
      amount: 900_000,
      coachWithdrawable: 100_000,
      athleteCashOut: 200_000,
    })).toBeNull()
  })

  it('honours explicit requestedRail', () => {
    expect(resolveWithdrawRail({
      isCoach: true,
      amount: 50_000,
      coachWithdrawable: 0,
      athleteCashOut: 500_000,
      requestedRail: 'athlete',
    })).toBe('athlete')
  })
})

describe('totalUserWithdrawable', () => {
  it('sums coach settlement and athlete cash-out for dual-role wallets', () => {
    expect(totalUserWithdrawable({
      isCoach: true,
      coachWithdrawable: 300_000,
      athleteCashOut: 150_000,
    })).toBe(450_000)
  })
})
