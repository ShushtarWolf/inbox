import { describe, expect, it } from 'vitest'
import { canCoverBookingWithWallet, shouldCreditTopUp } from './walletTopUp'

describe('shouldCreditTopUp (idempotent top-up gate)', () => {
  it('credits once on first PAID confirm', () => {
    expect(shouldCreditTopUp({
      previousStatus: 'PENDING_ONLINE',
      purpose: 'topup',
      status: 'PAID',
      userId: 'u1',
      alreadyCredited: false,
    })).toBe(true)
  })

  it('skips double callback when already PAID', () => {
    expect(shouldCreditTopUp({
      previousStatus: 'PAID',
      purpose: 'topup',
      status: 'PAID',
      userId: 'u1',
      alreadyCredited: false,
    })).toBe(false)
  })

  it('skips when TOPUP_CREDIT row already exists', () => {
    expect(shouldCreditTopUp({
      previousStatus: 'PENDING_ONLINE',
      purpose: 'topup',
      status: 'PAID',
      userId: 'u1',
      alreadyCredited: true,
    })).toBe(false)
  })

  it('ignores booking payments', () => {
    expect(shouldCreditTopUp({
      previousStatus: 'PENDING_ONLINE',
      purpose: 'booking',
      status: 'PAID',
      userId: 'u1',
      alreadyCredited: false,
    })).toBe(false)
  })
})

describe('canCoverBookingWithWallet (no split)', () => {
  it('allows full cover from wallet', () => {
    expect(canCoverBookingWithWallet(500_000, 400_000)).toBe(true)
    expect(canCoverBookingWithWallet(400_000, 400_000)).toBe(true)
  })

  it('rejects partial balance — pay online instead', () => {
    expect(canCoverBookingWithWallet(100_000, 400_000)).toBe(false)
    expect(canCoverBookingWithWallet(0, 400_000)).toBe(false)
  })

  it('rejects zero/negative amounts', () => {
    expect(canCoverBookingWithWallet(500_000, 0)).toBe(false)
    expect(canCoverBookingWithWallet(500_000, -1)).toBe(false)
  })
})
