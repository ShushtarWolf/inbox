const PERSIAN_ARABIC_DIGIT: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}

function toAsciiDigits(input: string) {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_ARABIC_DIGIT[ch] || ch)
}

/** Normalize Iranian mobile numbers to `09xxxxxxxxx`. */
export function normalizeIranPhone(input: string | null | undefined): string | null {
  if (!input) return null
  let digits = toAsciiDigits(input).replace(/[^\d+]/g, '').trim()
  if (!digits) return null

  if (digits.startsWith('+98')) digits = `0${digits.slice(3)}`
  else if (digits.startsWith('98') && digits.length >= 12) digits = `0${digits.slice(2)}`
  else if (digits.startsWith('9') && digits.length === 10) digits = `0${digits}`

  digits = digits.replace(/\D/g, '')
  if (!/^09\d{9}$/.test(digits)) return null
  return digits
}

/**
 * Common ways the same mobile may appear in guestMobile columns (desk / legacy).
 * Always includes the normalized `09…` form when valid.
 */
export function iranPhoneStorageVariants(input: string | null | undefined): string[] {
  const normalized = normalizeIranPhone(input)
  const trimmed = input?.trim()
  if (!normalized) return trimmed ? [trimmed] : []

  const national = normalized.slice(1) // 9xxxxxxxxx
  const variants = new Set<string>([
    normalized,
    national,
    `98${national}`,
    `+98${national}`,
  ])
  if (trimmed) variants.add(trimmed)
  return [...variants]
}

export function phoneToSyntheticEmail(phone: string): string {
  return `phone.${phone}@users.inbox.local`
}

export function isSyntheticPhoneEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith('@users.inbox.local'))
}
