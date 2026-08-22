import { describe, expect, it } from 'vitest'
import { isPaymentCallbackOk, readPaymentCallbackFields } from './paymentCallback'

describe('readPaymentCallbackFields', () => {
  it('reads SEP-style ResNum + RefNum + State', () => {
    expect(readPaymentCallbackFields({
      ResNum: 'SIMABC',
      RefNum: 'REF1',
      State: 'OK',
    })).toEqual({
      providerRef: 'SIMABC',
      refNum: 'REF1',
      statusRaw: 'OK',
    })
  })

  it('reads test-gateway NOK abandon', () => {
    expect(readPaymentCallbackFields({
      ResNum: 'SIMFAIL',
      State: 'NOK',
    })).toEqual({
      providerRef: 'SIMFAIL',
      refNum: undefined,
      statusRaw: 'NOK',
    })
  })

  it('merges POST body over query for provider ref', () => {
    expect(readPaymentCallbackFields(
      { ResNum: 'from-query' },
      { ResNum: 'from-body', State: 'Canceled' },
    )).toEqual({
      providerRef: 'from-body',
      refNum: undefined,
      statusRaw: 'CANCELED',
    })
  })
})

describe('isPaymentCallbackOk', () => {
  it('treats only explicit OK as success path (verify still required)', () => {
    expect(isPaymentCallbackOk('OK')).toBe(true)
    expect(isPaymentCallbackOk('')).toBe(false)
  })

  it('treats NOK / cancel / empty as failure path', () => {
    expect(isPaymentCallbackOk('NOK')).toBe(false)
    expect(isPaymentCallbackOk('CANCELED')).toBe(false)
  })
})
