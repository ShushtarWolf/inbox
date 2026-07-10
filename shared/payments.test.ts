import { describe, expect, it } from 'vitest'
import { getPaymentsMode } from './payments'

describe('getPaymentsMode', () => {
  it('defaults to pay_at_club', () => {
    const prev = process.env.PAYMENTS_MODE
    delete process.env.PAYMENTS_MODE
    expect(getPaymentsMode()).toBe('pay_at_club')
    process.env.PAYMENTS_MODE = prev
  })
})
