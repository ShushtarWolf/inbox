/** Normalize Iranian mobile numbers to `09xxxxxxxxx`. */
export function normalizeIranPhone(input: string | null | undefined): string | null {
  if (!input) return null
  let digits = input.replace(/[^\d+]/g, '').trim()
  if (!digits) return null

  if (digits.startsWith('+98')) digits = `0${digits.slice(3)}`
  else if (digits.startsWith('98') && digits.length >= 12) digits = `0${digits.slice(2)}`
  else if (digits.startsWith('9') && digits.length === 10) digits = `0${digits}`

  digits = digits.replace(/\D/g, '')
  if (!/^09\d{9}$/.test(digits)) return null
  return digits
}

export function phoneToSyntheticEmail(phone: string): string {
  return `phone.${phone}@users.inbox.local`
}

export function isSyntheticPhoneEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith('@users.inbox.local'))
}
