import { describe, expect, it } from 'vitest'
import { refundChannelFromPaymentMetadata, refundChannelI18nKey } from './refundChannelLabel.ts'

describe('refundChannelLabel', () => {
  it('maps channels to i18n keys', () => {
    expect(refundChannelI18nKey('wallet_closed_loop')).toBe('athlete.refundChannelWallet')
    expect(refundChannelI18nKey('gateway_reverse')).toBe('athlete.refundChannelGateway')
    expect(refundChannelI18nKey('desk_cash')).toBe('athlete.refundChannelDeskCash')
  })

  it('reads channel from payment metadata', () => {
    expect(refundChannelFromPaymentMetadata(JSON.stringify({ refundChannel: 'gateway_reverse' })))
      .toBe('gateway_reverse')
  })
})
