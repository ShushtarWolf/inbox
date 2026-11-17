import { describe, expect, it } from 'vitest'
import { reconcileReleaseBucketsToPending, pendingReleasesFromBuckets } from './settlementBreakdown.ts'

describe('reconcileReleaseBucketsToPending', () => {
  it('adds a positive gap to the latest release bucket', () => {
    const buckets = new Map([
      ['2026-11-10', 100_000],
      ['2026-11-17', 50_000],
    ])
    reconcileReleaseBucketsToPending(buckets, 225_000)
    expect([...buckets.values()].reduce((s, v) => s + v, 0)).toBe(225_000)
    expect(buckets.get('2026-11-17')).toBe(125_000)
  })

  it('trims an over-allocated bucket when buckets exceed pending', () => {
    const buckets = new Map([['2026-11-17', 360_000]])
    reconcileReleaseBucketsToPending(buckets, 225_000)
    expect(buckets.get('2026-11-17')).toBe(225_000)
  })
})

describe('pendingReleasesFromBuckets', () => {
  it('drops zero rows and sorts by date', () => {
    const rows = pendingReleasesFromBuckets(new Map([
      ['2026-12-01', 50_000],
      ['2026-11-15', 0],
      ['2026-11-20', 25_000],
    ]))
    expect(rows).toEqual([
      { releaseDate: '2026-11-20', amount: 25_000 },
      { releaseDate: '2026-12-01', amount: 50_000 },
    ])
  })
})