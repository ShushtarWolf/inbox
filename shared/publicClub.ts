/**
 * Allowlists for unauthenticated club / coach / package responses.
 *
 * Public endpoints must select fields explicitly — never spread a full Club row. Bank details
 * (sheba), owner identity (ownerId), commission, admin notes, verification documents and the
 * owner's private SMS numbers stay on owner/admin-authenticated endpoints only.
 * The club contact `phone` is public on purpose (shown on the club page).
 */

export const PUBLIC_CLUB_SCALAR_FIELDS = [
  'id',
  'slug',
  'nameFa',
  'nameEn',
  'addressFa',
  'addressEn',
  'city',
  'district',
  'lat',
  'lng',
  'rating',
  'priceFrom',
  'priceTo',
  'image',
  'featured',
  'status',
  'openHour',
  'closeHour',
  'defaultSessionDurationMinutes',
  'sessionDurationsJson',
  'descriptionFa',
  'descriptionEn',
  'phone',
  'whatsapp',
  'amenitiesJson',
  'policiesJson',
  'pricingJson',
  'verifiedAt',
  'cancellationWindowHours',
  'insideWindowRefundBps',
  'rescheduleWindowHours',
  'bookingHorizonDays',
  'waitlistEnabled',
] as const

/** Must never appear in a public club payload (top level or nested). */
export const PRIVATE_CLUB_FIELDS = [
  'sheba',
  'ownerId',
  'owner',
  'commissionBps',
  'credentialsJson',
  'verificationNote',
  'receiptPhone',
  'bookingNotifyPhone',
  'wallet',
  'withdrawRequests',
  'shebaChangeRequests',
  'settlementEntries',
  'commissionChanges',
  'memberships',
  'workers',
  'application',
] as const

type ScalarSelect<K extends readonly string[]> = { [P in K[number]]: true }

function toSelect<K extends readonly string[]>(keys: K): ScalarSelect<K> {
  return Object.fromEntries(keys.map((key) => [key, true])) as ScalarSelect<K>
}

/** Prisma `select` for public club scalars (spread, then add relations). */
export const PUBLIC_CLUB_SELECT = toSelect(PUBLIC_CLUB_SCALAR_FIELDS)

/** Small club card nested inside public coach / package payloads. */
export const PUBLIC_CLUB_SUMMARY_SELECT = {
  id: true,
  slug: true,
  nameFa: true,
  nameEn: true,
  city: true,
  district: true,
  image: true,
  status: true,
} as const

/** Public review fields — no author user id or booking link. */
export const PUBLIC_REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  authorName: true,
  isVerified: true,
  publishedAt: true,
} as const

/** Coach fields that stay off public listings (admin workflow + account link). */
export const PRIVATE_COACH_FIELDS = [
  'userId',
  'user',
  'verificationNote',
  'approvalNote',
  'approvalStatus',
  'appliedAt',
  'reviewedAt',
] as const

export function omitPrivateCoachFields<T extends Record<string, unknown>>(coach: T): Omit<T, (typeof PRIVATE_COACH_FIELDS)[number]> {
  const out: Record<string, unknown> = { ...coach }
  for (const key of PRIVATE_COACH_FIELDS) delete out[key]
  return out as Omit<T, (typeof PRIVATE_COACH_FIELDS)[number]>
}

/** Recursively collect any private club key present in a payload (for tests / guards). */
export function findPrivateClubKeys(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap((item, i) => findPrivateClubKeys(item, `${path}[${i}]`))
  const hits: string[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key
    if ((PRIVATE_CLUB_FIELDS as readonly string[]).includes(key)) hits.push(here)
    hits.push(...findPrivateClubKeys(child, here))
  }
  return hits
}
