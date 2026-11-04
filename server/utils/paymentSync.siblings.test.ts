import { describe, expect, it } from 'vitest'
import { GROUP_SIBLING_SETTLE_STATUSES } from './paymentSync'

describe('GROUP_SIBLING_SETTLE_STATUSES', () => {
  it('allows pending and failed intents only', () => {
    expect([...GROUP_SIBLING_SETTLE_STATUSES]).toEqual([
      'PENDING_ONLINE',
      'FAILED',
      'PAY_AT_CLUB',
      'PENDING_AT_CLUB',
    ])
  })

  it('blocks terminal and superseded statuses', () => {
    for (const status of ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'SUPERSEDED']) {
      expect((GROUP_SIBLING_SETTLE_STATUSES as readonly string[]).includes(status)).toBe(false)
    }
  })
})
