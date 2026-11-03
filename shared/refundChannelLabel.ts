import type { RefundChannel } from './cancelRefund.ts'
import { parsePaymentMetadata } from './cancelRefund.ts'

/** Athlete-facing short label key (i18n) for how cancel money was returned. */
export function refundChannelI18nKey(channel: RefundChannel | string | null | undefined): string | null {
  if (channel === 'gateway_reverse') return 'athlete.refundChannelGateway'
  if (channel === 'desk_cash') return 'athlete.refundChannelDeskCash'
  if (channel === 'wallet_closed_loop') return 'athlete.refundChannelWallet'
  return null
}

export function refundChannelFromPaymentMetadata(raw: string | null | undefined): RefundChannel | null {
  const meta = parsePaymentMetadata(raw)
  const ch = meta.refundChannel
  if (ch === 'gateway_reverse' || ch === 'desk_cash' || ch === 'wallet_closed_loop') {
    return ch
  }
  return null
}
