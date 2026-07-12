import { describe, expect, it } from 'vitest'
import { checkRateLimitBucket } from './rateLimitBucket'

describe('checkRateLimitBucket', () => {
  it('allows first request in a new window', () => {
    const result = checkRateLimitBucket(null, 1000)
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.bucket.count).toBe(1)
  })

  it('allows requests under the limit', () => {
    const bucket = { count: 5, resetAt: 5000 }
    const result = checkRateLimitBucket(bucket, 2000)
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.bucket.count).toBe(6)
  })

  it('blocks when limit exceeded', () => {
    const bucket = { count: 15, resetAt: 5000 }
    const result = checkRateLimitBucket(bucket, 2000)
    expect(result.allowed).toBe(false)
  })

  it('resets after window expires', () => {
    const bucket = { count: 15, resetAt: 1000 }
    const result = checkRateLimitBucket(bucket, 2000)
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.bucket.count).toBe(1)
  })
})
