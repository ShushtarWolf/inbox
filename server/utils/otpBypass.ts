import { normalizeIranPhone } from '#shared/phone.ts'

/** Comma/space-separated IR mobiles allowed to login without SMS OTP. */
export function otpBypassPhones(): Set<string> {
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
