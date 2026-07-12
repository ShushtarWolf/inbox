export const COURT_FACILITY_OPTIONS = [
  { slug: 'parking', nameFa: 'پارکینگ', nameEn: 'Parking' },
  { slug: 'shower', nameFa: 'دوش', nameEn: 'Shower' },
  { slug: 'locker', nameFa: 'رختکن', nameEn: 'Locker room' },
  { slug: 'cafe', nameFa: 'کافه', nameEn: 'Cafe' },
  { slug: 'wifi', nameFa: 'وای‌فای', nameEn: 'Wi-Fi' },
  { slug: 'shop', nameFa: 'فروشگاه', nameEn: 'Pro shop' },
  { slug: 'lighting', nameFa: 'نورپردازی', nameEn: 'Lighting' },
  { slug: 'ac', nameFa: 'تهویه/سرمایش', nameEn: 'Air conditioning' },
] as const

export type CourtFacilitySlug = (typeof COURT_FACILITY_OPTIONS)[number]['slug']

export function parseFacilitiesJson(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export const DEFAULT_SESSION_DURATIONS = [30, 45, 60, 90, 105, 120] as const

export function parseSessionDurationsJson(value: string | null | undefined): number[] {
  if (!value) return [60]
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return [60]
    const nums = parsed.filter((n): n is number => typeof n === 'number' && n > 0)
    return nums.length ? nums : [60]
  } catch {
    return [60]
  }
}

export function buildHourlyOptions(openHour: number, closeHour: number, stepMinutes = 60): string[] {
  const options: string[] = []
  const endTotal = closeHour * 60
  for (let m = openHour * 60; m < endTotal; m += stepMinutes) {
    const h = Math.floor(m / 60)
    const min = m % 60
    options.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`)
  }
  return options
}
