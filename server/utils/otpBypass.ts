import { normalizeIranPhone } from '#shared/phone.ts'

/**
 * Bypass is a local/dev escape hatch. In NODE_ENV=production it is ignored
 * unless ALLOW_OTP_BYPASS=true (ops must unset AUTH_OTP_BYPASS_PHONES on Liara).
 */
export function isOtpBypassAllowed(): boolean {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_OTP_BYPASS !== 'true') {
    return false
  }
  return true
}

/** Comma/space-separated IR mobiles allowed to login without SMS OTP. */
export function otpBypassPhones(): Set<string> {
  if (!isOtpBypassAllowed()) return new Set()
  const raw = process.env.AUTH_OTP_BYPASS_PHONES || ''
  const phones = raw
    .split(/[,\s]+/)
    .map((value) => normalizeIranPhone(value))
    .filter((value): value is string => Boolean(value))
  return new Set(phones)
}

export function isOtpBypassPhone(phoneRaw: string | null | undefined): boolean {
  const phone = normalizeIranPhone(phoneRaw)
  return Boolean(phone && otpBypassPhones().has(phone))
}
