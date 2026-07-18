/** Minimum checks for a club to appear in the catalog and accept court bookings. */

export type ClubReadinessInput = {
  status: string
  openHour: number
  closeHour: number
  nameFa?: string | null
  nameEn?: string | null
  addressFa?: string | null
  courts: Array<{ price?: number | null }>
  owner?: {
    disabledAt?: Date | string | null
    lastLoginAt?: Date | string | null
  } | null
}

export type ClubReadinessCheck = {
  id: 'published' | 'profile' | 'hours' | 'courts' | 'pricing' | 'ownerLogin'
  ok: boolean
}

export type ClubReadiness = {
  bookable: boolean
  checks: ClubReadinessCheck[]
}

function hasText(value?: string | null): boolean {
  return Boolean(value && value.trim())
}

export function evaluateClubReadiness(input: ClubReadinessInput): ClubReadiness {
  const published = input.status === 'ACTIVE'
  const profile = hasText(input.nameFa) && hasText(input.nameEn) && hasText(input.addressFa)
  const hours =
    Number.isFinite(input.openHour) &&
    Number.isFinite(input.closeHour) &&
    input.openHour >= 0 &&
    input.closeHour <= 24 &&
    input.openHour < input.closeHour
  const courts = input.courts.length >= 1
  const pricing = input.courts.some((court) => Number(court.price) > 0)
  const ownerLogin = Boolean(input.owner?.lastLoginAt) && !input.owner?.disabledAt

  const checks: ClubReadinessCheck[] = [
    { id: 'published', ok: published },
    { id: 'profile', ok: profile },
    { id: 'hours', ok: hours },
    { id: 'courts', ok: courts },
    { id: 'pricing', ok: pricing },
    { id: 'ownerLogin', ok: ownerLogin },
  ]

  // Catalog + booking do not require ownerLogin; that is ops-only.
  const bookable = published && profile && hours && courts && pricing

  return { bookable, checks }
}

export function minCourtPrice(courts: Array<{ price?: number | null }>): number | null {
  const prices = courts
    .map((court) => Number(court.price))
    .filter((price) => Number.isFinite(price) && price > 0)
  if (!prices.length) return null
  return Math.min(...prices)
}
