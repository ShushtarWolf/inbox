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

export type CourtOffPeakDiscount = {
  enabled: boolean
  startTime: string
  endTime: string
  percent: number
}

export type CourtPricingConfig = {
  timeBands?: CourtTimeBand[]
  lastSecondDiscount?: CourtLastSecondDiscount
  offPeakDiscount?: CourtOffPeakDiscount
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
      offPeakDiscount: parsed.offPeakDiscount?.enabled
        ? {
            enabled: true,
            startTime: String(parsed.offPeakDiscount.startTime || '08:00'),
            endTime: String(parsed.offPeakDiscount.endTime || '14:00'),
            percent: clampPercent(Number(parsed.offPeakDiscount.percent) || 0),
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
  if (config.offPeakDiscount?.enabled) payload.offPeakDiscount = config.offPeakDiscount
  if (!payload.timeBands?.length && !payload.lastSecondDiscount && !payload.offPeakDiscount) return null
  return JSON.stringify(payload)
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function applyPercentDiscount(price: number, percent: number): number {
  if (percent <= 0) return price
  return Math.max(0, Math.round(price * (1 - percent / 100)))
}

/** Listed slot price from base price + time bands + off-peak discount. */
export function computeListedSlotPrice(
  basePrice: number,
  startTime: string,
  pricingJson: string | null | undefined,
): number {
  const config = parseCourtPricingJson(pricingJson)
  let price = basePrice

  const band = config.timeBands?.find((item) => isTimeInRange(startTime, item.startTime, item.endTime))
  if (band) price = band.price

  if (config.offPeakDiscount?.enabled && isTimeInRange(startTime, config.offPeakDiscount.startTime, config.offPeakDiscount.endTime)) {
    price = applyPercentDiscount(price, config.offPeakDiscount.percent)
  }

  return price
}

export function hoursUntilSlot(slotDate: string, startTime: string, now = new Date()): number {
  const slotAt = new Date(`${slotDate}T${startTime}:00`)
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
    offPeakDiscount: { enabled: false, startTime: '08:00', endTime: '14:00', percent: 10 },
  }
}
