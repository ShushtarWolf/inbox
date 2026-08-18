/** Letters+digits only — survives Kavenegar Verify Lookup token / token10. */
export const PAY_PIN_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
export const PAY_PIN_LENGTH = 8

export function normalizePayPin(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function isPayPin(raw: string | null | undefined): boolean {
  const pin = normalizePayPin(raw)
  return /^[a-z0-9]{8}$/.test(pin)
}

export function payPath(pin: string) {
  return `/p/${encodeURIComponent(normalizePayPin(pin))}`
}

/** Map 09… mobile to a wa.me href with encoded text. */
export function whatsappHrefForIranMobile(mobile: string | null | undefined, text: string) {
  const encoded = encodeURIComponent(text)
  const digits = String(mobile || '').replace(/\D/g, '')
  let national = digits
  if (digits.startsWith('98') && digits.length >= 12) national = digits.slice(2)
  else if (digits.startsWith('0') && digits.length === 11) national = digits.slice(1)
  if (/^9\d{9}$/.test(national)) {
    return `https://wa.me/98${national}?text=${encoded}`
  }
  return `https://wa.me/?text=${encoded}`
}
