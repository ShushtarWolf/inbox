import type { Completeness } from './observation'
import { freeSlotKey } from './aloplayParse'

const MIN_DISTINCT_CLOCK_FOR_COMPLETE = 3
/** Free times must span at least this many hours or the free-set is treated as stub/truncated. */
const MIN_FREE_SPAN_HOURS = 6

/** Distinct HH:mm values in free-set keys `productId:HH:mm`. */
export function distinctClockTimes(freeSlots: Set<string>): Set<string> {
  const starts = new Set<string>()
  for (const key of freeSlots) {
    const colon = key.indexOf(':')
    if (colon === -1) continue
    starts.add(key.slice(colon + 1))
  }
  return starts
}

export function distinctProductIds(freeSlots: Set<string>): Set<number> {
  const ids = new Set<number>()
  for (const key of freeSlots) {
    const colon = key.indexOf(':')
    if (colon === -1) continue
    const id = Number(key.slice(0, colon))
    if (Number.isFinite(id)) ids.add(id)
  }
  return ids
}

export function clocksForProduct(freeSlots: Set<string>, productId: number): Set<string> {
  const prefix = `${productId}:`
  const starts = new Set<string>()
  for (const key of freeSlots) {
    if (!key.startsWith(prefix)) continue
    starts.add(key.slice(prefix.length))
  }
  return starts
}

function clockToMinutes(clock: string): number | null {
  const m = clock.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Hours between earliest and latest free clock (0 if fewer than 2 clocks). */
export function freeClockSpanHours(freeSlots: Set<string>): number {
  const clocks = [...distinctClockTimes(freeSlots)]
  if (clocks.length < 2) return 0
  const mins = clocks
    .map(clockToMinutes)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b)
  if (mins.length < 2) return 0
  return (mins[mins.length - 1]! - mins[0]!) / 60
}

/**
 * AloPlay free-set completeness.
 * COMPLETE only when the free map is rich enough that missing hours may be BUSY:
 * - every mapped product has ≥3 distinct free clocks, and
 * - free clocks span ≥6 hours (guards truncated mid-day stubs).
 * Otherwise PARTIAL (some products/span ok) or UNKNOWN (too thin).
 */
export function assessAloPlayCompleteness(opts: {
  freeSlots: Set<string>
  mappedProductIds: number[]
  parseError?: string
}): Completeness {
  if (opts.parseError) return 'UNKNOWN'
  if (opts.freeSlots.size === 0) return 'UNKNOWN'
  if (opts.mappedProductIds.length === 0) return 'UNKNOWN'

  const clocks = distinctClockTimes(opts.freeSlots)
  if (clocks.size < MIN_DISTINCT_CLOCK_FOR_COMPLETE) return 'UNKNOWN'

  const products = distinctProductIds(opts.freeSlots)
  if (products.size === 0) return 'UNKNOWN'

  const mapped = [...new Set(opts.mappedProductIds)]
  const overlap = mapped.filter((id) => products.has(id))
  if (!overlap.length) return 'UNKNOWN'

  const productsRich = mapped.filter(
    (id) => clocksForProduct(opts.freeSlots, id).size >= MIN_DISTINCT_CLOCK_FOR_COMPLETE,
  )
  const spanOk = freeClockSpanHours(opts.freeSlots) >= MIN_FREE_SPAN_HOURS

  if (productsRich.length === mapped.length && spanOk) return 'COMPLETE'
  if (productsRich.length > 0 || (overlap.length > 0 && spanOk)) return 'PARTIAL'
  return 'UNKNOWN'
}

export function isProductFree(
  freeSlots: Set<string>,
  productId: number,
  startTime: string,
): boolean {
  return freeSlots.has(freeSlotKey(productId, startTime))
}
