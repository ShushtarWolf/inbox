import { describe, expect, it } from 'vitest'
import {
  buildManualBankRefundReturnedMetadata,
  isManualBankRefundOwed,
  MANUAL_REFUND_MARKER,
  readManualBankRefund,
} from './cancelRefund.ts'

describe('manualBankRefund ack', () => {
  it('marks owed until returned', () => {
    const owed = {
      manualRefundRequired: true,
      manualBankRefund: 'owed' as const,
    }
    expect(isManualBankRefundOwed(owed)).toBe(true)
    expect(MANUAL_REFUND_MARKER).toContain('manualRefundRequired')
    const returned = buildManualBankRefundReturnedMetadata(owed, {
      note: 'wired',
      guestSheba: 'IR820540102680020817909002',
    })
    expect(readManualBankRefund(returned)).toBe('returned')
    expect(isManualBankRefundOwed(returned)).toBe(false)
    expect(returned.guestSheba).toBe('IR820540102680020817909002')
  })
})
