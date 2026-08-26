/** Products with remainedCapacity===0 from AloPlay GetByTime `data` array. */
export function occupiedProductIdsFromByTime(payload: unknown): Set<number> {
  const occupied = new Set<number>()
  if (!payload || typeof payload !== 'object') return occupied

  const record = payload as Record<string, unknown>
  const rows = Array.isArray(record.data) ? record.data : null
  if (!rows) return occupied

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const product = row as Record<string, unknown>
    const productId = product.productId
    if (typeof productId !== 'number') continue
    if (product.remainedCapacity === 0) occupied.add(productId)
  }

  return occupied
}

/** Union occupied product ids across gender-specific GetByTime responses. */
export function unionOccupiedProductIds(payloads: unknown[]): Set<number> {
  const union = new Set<number>()
  for (const payload of payloads) {
    for (const productId of occupiedProductIdsFromByTime(payload)) {
      union.add(productId)
    }
  }
  return union
}
