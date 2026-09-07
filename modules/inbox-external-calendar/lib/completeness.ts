import type { Completeness } from './observation'
import { freeSlotKey } from './aloplayParse'

const MIN_DISTINCT_CLOCK_FOR_COMPLETE = 3

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

/**
 * AloPlay free-set completeness.
 * COMPLETE only when the free map is rich enough that missing hours may be treated as EXTERNAL_BUSY.
 * Empty / tiny / stub-like maps are UNKNOWN (never BUSY).
 */
export function assessAloPlayCompleteness(opts: {
  freeSlots: Set<string>
  mappedProductIds: number[]
  parseError?: string
}): Completeness {
  if (opts.parseError) return 'UNKNOWN'
  if (opts.freeSlots.size === 0) return 'UNKNOWN'

  const clocks = distinctClockTimes(opts.freeSlots)
  if (clocks.size < MIN_DISTINCT_CLOCK_FOR_COMPLETE) return 'UNKNOWN'

  const products = distinctProductIds(opts.freeSlots)
  if (products.size === 0) return 'UNKNOWN'

  // At least one mapped product must appear; otherwise response is not about our courts.
  const mapped = new Set(opts.mappedProductIds)
  const overlap = [...products].some((id) => mapped.has(id))
  if (!overlap) return 'UNKNOWN'

  return 'COMPLETE'
}

export function isProductFree(
  freeSlots: Set<string>,
  productId: number,
  startTime: string,
): boolean {
  return freeSlots.has(freeSlotKey(productId, startTime))
}
