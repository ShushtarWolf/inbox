export type SmsOtpAutofillHost = {
  OTPCredential?: unknown
  navigator?: {
    credentials?: {
      get: (options: unknown) => Promise<{ code?: string } | null>
    }
  }
}

/** True when the browser implements the WebOTP API (Chrome Android). */
export function canUseWebOtp(host: SmsOtpAutofillHost | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  return Boolean(host?.OTPCredential && host.navigator?.credentials?.get)
}

/**
 * Listen for an SMS OTP via WebOTP. Returns a stop function (abort).
 * iOS Safari ignores this and uses `autocomplete="one-time-code"` instead.
 */
export function startSmsOtpAutofill(
  onCode: (code: string) => void,
  host: SmsOtpAutofillHost | undefined = typeof window === 'undefined' ? undefined : window,
): () => void {
  const get = host?.navigator?.credentials?.get
  if (!canUseWebOtp(host) || !get) return () => {}

  const abort = new AbortController()
  void get.call(host.navigator!.credentials, {
    otp: { transport: ['sms'] },
    signal: abort.signal,
  }).then((cred) => {
    const next = String(cred?.code || '').replace(/\D/g, '')
    if (next.length >= 4 && next.length <= 8) onCode(next.slice(0, 6))
  }).catch(() => {})

  return () => abort.abort()
}
