export type CourtTimeBand = {
  labelFa?: string
  labelEn?: string
  startTime: string
  endTime: string
  price: number
}

export type CourtLastSecondDiscount = {
  enabled: boolean
  hoursBefore: number
  percent: number
}

export type CourtPricingConfig = {
  timeBands?: CourtTimeBand[]
  lastSecondDiscount?: CourtLastSecondDiscount
}

export function minutesFromTime(time: string): number {
  const h = Number.parseInt(time.slice(0, 2), 10)
  const m = Number.parseInt(time.slice(3, 5) || '0', 10)
  return h * 60 + m
}

export function isTimeInRange(time: string, startTime: string, endTime: string): boolean {
  const t = minutesFromTime(time)
  const start = minutesFromTime(startTime)
  const end = minutesFromTime(endTime)
  return t >= start && t < end
}

export function parseCourtPricingJson(value: string | null | undefined): CourtPricingConfig {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return {}
    return {
      timeBands: Array.isArray(parsed.timeBands)
        ? parsed.timeBands.filter((band: unknown): band is CourtTimeBand => {
            if (!band || typeof band !== 'object') return false
            const b = band as CourtTimeBand
            return typeof b.startTime === 'string'
              && typeof b.endTime === 'string'
              && typeof b.price === 'number'
              && b.price >= 0
          })
        : undefined,
      lastSecondDiscount: parsed.lastSecondDiscount?.enabled
        ? {
            enabled: true,
            hoursBefore: Math.max(0, Number(parsed.lastSecondDiscount.hoursBefore) || 0),
            percent: clampPercent(Number(parsed.lastSecondDiscount.percent) || 0),
          }
        : undefined,
    }
  } catch {
    return {}
  }
}

export function serializeCourtPricingJson(config: CourtPricingConfig): string | null {
  const payload: CourtPricingConfig = {}
  if (config.timeBands?.length) payload.timeBands = config.timeBands
  if (config.lastSecondDiscount?.enabled) payload.lastSecondDiscount = config.lastSecondDiscount
  if (!payload.timeBands?.length && !payload.lastSecondDiscount) return null
  return JSON.stringify(payload)
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function applyPercentDiscount(price: number, percent: number): number {
  if (percent <= 0) return price
  return Math.max(0, Math.round(price * (1 - percent / 100)))
}

/** Listed slot price from base price + time bands. */
export function computeListedSlotPrice(
  basePrice: number,
  startTime: string,
  pricingJson: string | null | undefined,
): number {
  const config = parseCourtPricingJson(pricingJson)
  const band = config.timeBands?.find((item) => isTimeInRange(startTime, item.startTime, item.endTime))
  return band ? band.price : basePrice
}

export function hoursUntilSlot(slotDate: string, startTime: string, now = new Date()): number {
  // Slot wall-clock is club time (Asia/Tehran, fixed +03:30, no DST since 2022).
  // Without an explicit offset the server (UTC) and browser (Tehran) disagree by 3.5h,
  // so last-second discount showed on checkout but was not charged.
  const slotAt = new Date(`${slotDate}T${startTime.slice(0, 5)}:00+03:30`)
  const diffMs = slotAt.getTime() - now.getTime()
  return diffMs / (1000 * 60 * 60)
}

/** Booking-time discount for reservations close to start time. */
export function computeBookingPrice(
  listedPrice: number,
  pricingJson: string | null | undefined,
  slotDate: string,
  startTime: string,
  now = new Date(),
): number {
  const config = parseCourtPricingJson(pricingJson)
  const discount = config.lastSecondDiscount
  if (!discount?.enabled || discount.percent <= 0) return listedPrice

  const hoursLeft = hoursUntilSlot(slotDate, startTime, now)
  if (hoursLeft < 0 || hoursLeft > discount.hoursBefore) return listedPrice

  return applyPercentDiscount(listedPrice, discount.percent)
}

export function defaultCourtPricingConfig(): CourtPricingConfig {
  return {
    timeBands: [],
    lastSecondDiscount: { enabled: false, hoursBefore: 2, percent: 15 },
  }
}

/**
 * Next band an owner adds with the explicit "add band" button.
 * Pure so the default is testable: the price starts at the current base price,
 * and `normalizeCourtPricingForSave` drops it if the owner never changes it
 * (a price-neutral band silently diverges once the base price is edited later).
 */
export function nextTimeBand(
  existing: CourtTimeBand[],
  starts: string[],
  ends: string[],
  basePrice: number,
): CourtTimeBand {
  const lastEnd = existing.length ? existing[existing.length - 1]!.endTime : starts[0] || '09:00'
  const startIdx = starts.indexOf(lastEnd)
  const startTime = startIdx >= 0 && startIdx < starts.length
    ? starts[startIdx]!
    : starts[0] || '08:00'
  const endFromStart = ends.indexOf(startTime)
  const endIdx = Math.min(ends.length - 1, (endFromStart >= 0 ? endFromStart : 0) + 2)
  const endTime = ends[endIdx] || '10:00'
  return { labelFa: '', labelEn: '', startTime, endTime, price: basePrice }
}

/**
 * Clean the pricing payload before it is saved for a court:
 * - drop bands with an empty/inverted range,
 * - drop bands whose price equals the base price (no effect today, but they keep
 *   the old price after the base is edited — the IUST «زمین ۳» 480,000 phantom).
 * Returns serialized JSON (or null when nothing remains).
 */
export function normalizeCourtPricingForSave(
  basePrice: number,
  pricingJson: string | null | undefined,
): string | null {
  const config = parseCourtPricingJson(pricingJson)
  const timeBands = (config.timeBands || []).filter((band) =>
    minutesFromTime(band.endTime) > minutesFromTime(band.startTime)
    && band.price !== basePrice,
  )
  return serializeCourtPricingJson({ timeBands, lastSecondDiscount: config.lastSecondDiscount })
}

/** Stable comparison of two pricingJson values (ignores key order / formatting). */
export function samePricingJson(a: string | null | undefined, b: string | null | undefined): boolean {
  return serializeCourtPricingJson(parseCourtPricingJson(a)) === serializeCourtPricingJson(parseCourtPricingJson(b))
}

export type CourtPricingSummary = {
  bands: Array<{ startTime: string; endTime: string; price: number }>
  lastSecondDiscount: { hoursBefore: number; percent: number } | null
}

/** What the owner settings court list shows next to the base price. */
export function summarizeCourtPricing(pricingJson: string | null | undefined): CourtPricingSummary {
  const config = parseCourtPricingJson(pricingJson)
  const bands = [...(config.timeBands || [])]
    .sort((a, b) => minutesFromTime(a.startTime) - minutesFromTime(b.startTime))
    .map(({ startTime, endTime, price }) => ({ startTime, endTime, price }))
  const discount = config.lastSecondDiscount
  return {
    bands,
    lastSecondDiscount: discount?.enabled && discount.percent > 0
      ? { hoursBefore: discount.hoursBefore, percent: discount.percent }
      : null,
  }
}
