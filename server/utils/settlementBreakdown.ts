import { addDaysToIsoDate, localDateString } from '#shared/localDate.ts'

export type ClubPendingReleaseRow = { releaseDate: string; amount: number }

export function reconcileReleaseBucketsToPending(
  buckets: Map<string, number>,
  pending: number,
) {
  let sum = 0
  for (const value of buckets.values()) sum += value
  const diff = pending - sum
  if (diff === 0) return
  if (diff > 0) {
    const dates = [...buckets.keys()].sort((a, b) => a.localeCompare(b))
    const key = dates.length ? dates[dates.length - 1]! : addDaysToIsoDate(localDateString(), 1)
    buckets.set(key, (buckets.get(key) || 0) + diff)
    return
  }
  if (sum <= 0) return
  const [largestKey, largestAmount] = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]!
  buckets.set(largestKey, Math.max(0, largestAmount + diff))
}

export function pendingReleasesFromBuckets(buckets: Map<string, number>): ClubPendingReleaseRow[] {
  return [...buckets.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([releaseDate, amount]) => ({ releaseDate, amount }))
}