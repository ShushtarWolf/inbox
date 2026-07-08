export function parseJsonArray(value?: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function parseJsonValue<T>(value?: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function reviewSummary(reviews: Array<{ rating: number; isVerified: boolean }>) {
  const count = reviews.length
  const verifiedCount = reviews.filter((review) => review.isVerified).length
  const average = count ? Number((reviews.reduce((sum, review) => sum + review.rating, 0) / count).toFixed(1)) : 0
  return { average, count, verifiedCount }
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function clubRankingScore(input: {
  featured: boolean
  rating: number
  reviewCount: number
  priceFrom: number
  distanceKm?: number | null
}) {
  const featureBoost = input.featured ? 3 : 0
  const ratingBoost = input.rating
  const reviewBoost = Math.min(input.reviewCount, 25) / 10
  const affordabilityBoost = input.priceFrom <= 550000 ? 1.5 : input.priceFrom <= 700000 ? 0.75 : 0
  const nearbyBoost = typeof input.distanceKm === 'number'
    ? Math.max(0, 2 - input.distanceKm / 5)
    : 0
  return Number((featureBoost + ratingBoost + reviewBoost + affordabilityBoost + nearbyBoost).toFixed(2))
}

export function coachRankingScore(input: {
  featured: boolean
  rating: number
  reviewCount: number
  experienceYears: number
  isBookable: boolean
}) {
  const featureBoost = input.featured ? 3 : 0
  const ratingBoost = input.rating
  const reviewBoost = Math.min(input.reviewCount, 20) / 10
  const experienceBoost = Math.min(input.experienceYears, 10) / 5
  const bookableBoost = input.isBookable ? 1.5 : 0
  return Number((featureBoost + ratingBoost + reviewBoost + experienceBoost + bookableBoost).toFixed(2))
}

export function getQueryNumber(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
