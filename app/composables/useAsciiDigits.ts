import { normalizeAsciiDigitInput } from '#shared/digits.ts'

type AsciiDigitOptions = { digitsOnly?: boolean; maxLength?: number }

/**
 * Keep a string ref in Latin digits while the user types (۰۹۱۲ → 0912).
 * Bind once per phone / OTP / amount ref — no template change needed.
 */
export function useAsciiDigits(
  model: Ref<string>,
  options?: AsciiDigitOptions,
) {
  watch(model, (value) => {
    const next = normalizeAsciiDigitInput(String(value ?? ''), options)
    if (next !== value) model.value = next
  })
}

/** Same normalize for reactive object fields (e.g. form.guestMobile). */
export function watchAsciiDigits(
  source: () => string,
  assign: (next: string) => void,
  options?: AsciiDigitOptions,
) {
  watch(source, (value) => {
    const next = normalizeAsciiDigitInput(String(value ?? ''), options)
    if (next !== value) assign(next)
  })
}
