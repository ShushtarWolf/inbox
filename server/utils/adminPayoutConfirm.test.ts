import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('#shared/payments.ts', () => ({
  getPaymentsMode: vi.fn(() => 'test'),
}))

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})
vi.stubGlobal('getHeader', (_event: unknown, name: string) => {
  return (globalThis as { __hdr?: Record<string, string> }).__hdr?.[name]
})

import { getPaymentsMode } from '#shared/payments.ts'
import { requireAdminPayoutConfirm } from './adminPayoutConfirm'

describe('requireAdminPayoutConfirm', () => {
  afterEach(() => {
    delete process.env.ADMIN_PAYOUT_CONFIRM
    ;(globalThis as { __hdr?: Record<string, string> }).__hdr = {}
    vi.mocked(getPaymentsMode).mockReturnValue('test')
  })

  it('requires confirmPayout body when env unset (non-live)', () => {
    expect(() => requireAdminPayoutConfirm({} as never, {})).toThrow(/confirmPayout/)
    expect(() => requireAdminPayoutConfirm({} as never, { confirmPayout: true })).not.toThrow()
  })

  it('blocks live when ADMIN_PAYOUT_CONFIRM unset', () => {
    vi.mocked(getPaymentsMode).mockReturnValue('live')
    expect(() => requireAdminPayoutConfirm({} as never, { confirmPayout: true })).toThrow(
      /ADMIN_PAYOUT_CONFIRM required/,
    )
  })

  it('checks header when env set', () => {
    process.env.ADMIN_PAYOUT_CONFIRM = 'secret-confirm'
    ;(globalThis as { __hdr?: Record<string, string> }).__hdr = {
      'x-admin-payout-confirm': 'secret-confirm',
    }
    expect(() => requireAdminPayoutConfirm({} as never, {})).not.toThrow()
  })
})
