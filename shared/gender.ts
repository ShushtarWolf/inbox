export type GenderValue = 'MALE' | 'FEMALE'

/** Accept API/UI values; reject anything else as null (caller decides required). */
export function parseGender(raw: unknown): GenderValue | null {
  if (raw === 'MALE' || raw === 'FEMALE') return raw
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toUpperCase()
  if (normalized === 'MALE' || normalized === 'M' || raw.trim() === 'مرد') return 'MALE'
  if (normalized === 'FEMALE' || normalized === 'F' || raw.trim() === 'زن') return 'FEMALE'
  return null
}
