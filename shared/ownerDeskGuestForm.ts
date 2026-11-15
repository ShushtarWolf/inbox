import { normalizeAsciiDigitInput } from './digits.ts'

/** Normalize owner desk guest mobile from a live input value (Persian digits → Latin, digits only). */
export function applyGuestMobileInput(rawInput: string): string {
  return normalizeAsciiDigitInput(String(rawInput ?? ''))
}

/**
 * Prefer the DOM value when autofill or IME painted into the input without updating v-model
 * (regression on owner calendar walk-in reserve after modal layout changes).
 */
export function mergeGuestMobileFromDom(
  modelValue: string,
  domValue: string | undefined | null,
): string {
  const fromDom = String(domValue ?? '').trim()
  if (!fromDom) return applyGuestMobileInput(modelValue)
  return applyGuestMobileInput(fromDom)
}