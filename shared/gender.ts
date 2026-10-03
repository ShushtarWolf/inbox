export type GenderValue = 'MALE' | 'FEMALE'

export const DEFAULT_AVATAR_MALE = '/placeholders/avatar-male.png'
export const DEFAULT_AVATAR_FEMALE = '/placeholders/avatar-female.png'

/** Gender-specific placeholder when the user has not uploaded a photo. */
export function defaultAvatarUrl(gender: unknown): string | null {
  const parsed = parseGender(gender)
  if (parsed === 'FEMALE') return DEFAULT_AVATAR_FEMALE
  if (parsed === 'MALE') return DEFAULT_AVATAR_MALE
  return null
}

/** Accept API/UI values; reject anything else as null (caller decides required). */
export function parseGender(raw: unknown): GenderValue | null {
  if (raw === 'MALE' || raw === 'FEMALE') return raw
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toUpperCase()
  if (normalized === 'MALE' || normalized === 'M' || raw.trim() === 'مرد') return 'MALE'
  if (normalized === 'FEMALE' || normalized === 'F' || raw.trim() === 'زن') return 'FEMALE'
  return null
}
