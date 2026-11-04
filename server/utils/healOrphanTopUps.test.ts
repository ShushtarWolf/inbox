import { describe, expect, it } from 'vitest'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'

/** Pure pan extract used by healOrphanTopUps — fails if metadata shape drifts. */
describe('orphan top-up maskedPan recovery', () => {
  it('reads SEP maskedPan from payment metadata', () => {
    const meta = parsePaymentMetadata(JSON.stringify({
      purpose: 'topup',
      maskedPan: '603799****0580',
      refNum: 'abc',
    }))
    expect(typeof meta.maskedPan).toBe('string')
    expect(String(meta.maskedPan).trim()).toBe('603799****0580')
  })

  it('returns empty when pan missing', () => {
    const meta = parsePaymentMetadata('{"purpose":"topup"}')
    const pan = typeof meta.maskedPan === 'string' ? meta.maskedPan.trim() : ''
    expect(pan).toBe('')
  })
})
