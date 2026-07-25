import { afterEach, describe, expect, it } from 'vitest'
import { shouldCreditWalletAfterGatewayRefund } from './bookingPayment'

describe('shouldCreditWalletAfterGatewayRefund', () => {
  const prev = process.env.PAYMENTS_MODE

  afterEach(() => {
    if (prev === undefined) delete process.env.PAYMENTS_MODE
    else process.env.PAYMENTS_MODE = prev
  })

  it('credits wallet in test mode (no real bank reverse)', () => {
    process.env.PAYMENTS_MODE = 'test'
    expect(shouldCreditWalletAfterGatewayRefund({ providerRef: 'SIMabc', metadataJson: null })).toBe(true)
  })

  it('credits wallet for simulated SEP refs even if mode says live', () => {
    process.env.PAYMENTS_MODE = 'live'
    expect(shouldCreditWalletAfterGatewayRefund({
      providerRef: 'SIMdeadbeef',
      metadataJson: JSON.stringify({ simulated: true }),
    })).toBe(true)
  })

  it('does not credit wallet for live non-simulated IPG', () => {
    process.env.PAYMENTS_MODE = 'live'
    expect(shouldCreditWalletAfterGatewayRefund({
      providerRef: 'INBrealref',
      metadataJson: JSON.stringify({ refNum: '123' }),
    })).toBe(false)
  })
})
