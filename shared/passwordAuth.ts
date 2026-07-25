import { normalizeIranPhone, phoneToSyntheticEmail } from './phone.ts'

export type RegisterIdentity = {
  phone: string | null
  email: string
}

/**
 * Resolve athlete/owner password-register identity.
 * Prefer phone (synthetic email when email omitted); else real email + optional phone.
 */
export function resolvePasswordRegisterIdentity(input: {
  phone?: string | null
  email?: string | null
}): RegisterIdentity | null {
  const phone = normalizeIranPhone(input.phone || '')
  const emailRaw = input.email?.trim().toLowerCase() || ''
  if (phone) {
    return { phone, email: emailRaw || phoneToSyntheticEmail(phone) }
  }
  if (emailRaw && emailRaw.includes('@')) {
    return { phone: null, email: emailRaw }
  }
  return null
}

export function isPasswordLongEnough(password: string | null | undefined, min = 6): boolean {
  return Boolean(password && password.length >= min)
}
