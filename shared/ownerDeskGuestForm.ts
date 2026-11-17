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

export type GuestDeskInputValues = {
  guestName: string
  guestFamily: string
  guestMobile: string
}

/** Push reactive guest fields into native inputs after autocomplete pick (Safari v-model race). */
export function applyGuestDeskInputsFromModel(
  values: GuestDeskInputValues,
  elements: {
    guestName?: Pick<HTMLInputElement, 'value'> | null
    guestFamily?: Pick<HTMLInputElement, 'value'> | null
    guestMobile?: Pick<HTMLInputElement, 'value'> | null
  },
) {
  if (elements.guestName) elements.guestName.value = values.guestName
  if (elements.guestFamily) elements.guestFamily.value = values.guestFamily
  if (elements.guestMobile) elements.guestMobile.value = values.guestMobile
}