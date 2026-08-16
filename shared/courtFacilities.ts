export const COURT_FACILITY_OPTIONS = [
  { slug: 'parking', nameFa: 'پارکینگ', nameEn: 'Parking' },
  { slug: 'shower', nameFa: 'دوش', nameEn: 'Shower' },
  { slug: 'locker', nameFa: 'رختکن', nameEn: 'Locker room' },
  { slug: 'cafe', nameFa: 'کافه', nameEn: 'Cafe' },
  { slug: 'wifi', nameFa: 'وای‌فای', nameEn: 'Wi-Fi' },
  { slug: 'shop', nameFa: 'فروشگاه', nameEn: 'Pro shop' },
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

export const DEFAULT_SESSION_DURATIONS = [30, 45, 55, 60, 90, 105, 120] as const

export function parseImagesJson(value: string | null | undefined, fallbackImage?: string | null): string[] {
  const fromJson = (() => {
    if (!value) return [] as string[]
    try {
      const parsed = JSON.parse(value)
      if (!Array.isArray(parsed)) return [] as string[]
      return parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    } catch {
      return [] as string[]
    }
  })()
  if (fromJson.length) return fromJson.slice(0, 4)
  return fallbackImage ? [fallbackImage] : []
}

export function serializeImagesJson(urls: string[]): string | null {
  const cleaned = urls.map((u) => u.trim()).filter(Boolean).slice(0, 4)
  return cleaned.length ? JSON.stringify(cleaned) : null
}

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

/** Formats minute-of-day as HH:mm; 1440 → 24:00 (midnight close). */
export function formatMinutesAsTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const min = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/**
 * Hourly (or stepped) clock options from open to close.
 * By default close is exclusive (start slots). Pass includeClose for end-time selects so e.g. 24:00 appears.
 */
export function buildHourlyOptions(
  openHour: number,
  closeHour: number,
  stepMinutes = 60,
  includeClose = false,
): string[] {
  const options: string[] = []
  const endTotal = closeHour * 60
  for (let m = openHour * 60; m < endTotal; m += stepMinutes) {
    options.push(formatMinutesAsTime(m))
  }
  if (includeClose) {
    const closeLabel = formatMinutesAsTime(endTotal)
    if (options[options.length - 1] !== closeLabel) {
      options.push(closeLabel)
    }
  }
  return options
}
