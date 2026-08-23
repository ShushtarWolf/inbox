const PERSIAN_ARABIC_DIGIT: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}

/** Persian / Arabic-Indic digits → Latin; other characters unchanged. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_ARABIC_DIGIT[ch] ?? ch)
}

/** Latin digits only, after Persian/Arabic normalization. */
export function extractAsciiDigits(input: string): string {
  return toAsciiDigits(input).replace(/\D/g, '')
}

export function parseAsciiInt(input: string | null | undefined): number | null {
  const digits = extractAsciiDigits(String(input ?? ''))
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}
