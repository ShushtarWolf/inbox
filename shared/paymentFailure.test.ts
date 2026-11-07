import { describe, expect, it } from 'vitest'
import { createError } from 'h3'
import { isDefinitivePaymentFailure, paymentFailureData } from './paymentFailure.ts'
import { isReversedCaptureReadyToReplace, shouldPreserveUnsettledCapture } from './paymentInFlight.ts'

describe('payment failure disposition', () => {
  it('fails the row only when the error is explicitly definitive', () => {
    const declined = createError({
      statusCode: 402,
      statusMessage: 'declined',
      data: paymentFailureData(true, 'SEP_VERIFY_DECLINED'),
    })
    const ambiguous = createError({
      statusCode: 503,
      statusMessage: 'retry',
      data: paymentFailureData(false, 'SEP_VERIFY_AMBIGUOUS'),
    })
    expect(isDefinitivePaymentFailure(declined)).toBe(true)
    expect(isDefinitivePaymentFailure(ambiguous)).toBe(false)
    expect(isDefinitivePaymentFailure(new Error('fetch failed'))).toBe(false)
    expect(isDefinitivePaymentFailure(null)).toBe(false)
  })
})

describe('unsettled capture preservation', () => {
  it('keeps a row that has a bank ref, a pending verify, or an unfinished reverse', () => {
    expect(shouldPreserveUnsettledCapture({ gatewayRef: 'ref-1', metadataJson: null })).toBe(true)
    expect(shouldPreserveUnsettledCapture({
      metadataJson: JSON.stringify({ verifyPendingRefNum: 'ref-1' }),
    })).toBe(true)
    expect(shouldPreserveUnsettledCapture({
      metadataJson: JSON.stringify({ reversePending: true }),
    })).toBe(true)
    expect(shouldPreserveUnsettledCapture({ metadataJson: '{}' })).toBe(false)
  })

  it('allows checkout to replace a capture only after reverse has finished', () => {
    expect(isReversedCaptureReadyToReplace(JSON.stringify({
      gatewayReversed: true,
      reversePending: false,
    }))).toBe(true)
    expect(isReversedCaptureReadyToReplace(JSON.stringify({
      gatewayReversed: true,
      reversePending: true,
    }))).toBe(false)
  })
})
