import { describe, expect, it, vi } from 'vitest'
import { canUseWebOtp, startSmsOtpAutofill } from './useSmsOtpAutofill'

describe('canUseWebOtp', () => {
  it('is false without OTPCredential', () => {
    expect(canUseWebOtp({ navigator: { credentials: { get: async () => null } } })).toBe(false)
    expect(canUseWebOtp(undefined)).toBe(false)
  })

  it('is true when OTPCredential and credentials.get exist', () => {
    expect(canUseWebOtp({
      OTPCredential: function OTPCredential() {},
      navigator: { credentials: { get: async () => null } },
    })).toBe(true)
  })
})

describe('startSmsOtpAutofill', () => {
  it('does nothing when WebOTP is unavailable', () => {
    const onCode = vi.fn()
    const stop = startSmsOtpAutofill(onCode, {})
    stop()
    expect(onCode).not.toHaveBeenCalled()
  })

  it('writes a 6-digit code from WebOTP and aborts on stop', async () => {
    const onCode = vi.fn()
    let seenSignal: AbortSignal | undefined
    const get = vi.fn().mockImplementation(async (options: { signal?: AbortSignal }) => {
      seenSignal = options.signal
      return { code: '913717' }
    })
    const stop = startSmsOtpAutofill(onCode, {
      OTPCredential: function OTPCredential() {},
      navigator: { credentials: { get } },
    })
    await Promise.resolve()
    expect(onCode).toHaveBeenCalledWith('913717')
    stop()
    expect(seenSignal?.aborted).toBe(true)
  })
})
