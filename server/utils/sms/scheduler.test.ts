import { describe, expect, it } from 'vitest'
import { formatSchedulerResult } from './scheduler'

describe('formatSchedulerResult', () => {
  it('describes successful processing without claiming unsent delivery', () => {
    const result = formatSchedulerResult({
      processed: 2,
      failed: 0,
      pending: 1,
      provider: 'live',
    })
    expect(result.processed).toBe(2)
    expect(result.pending).toBe(1)
    expect(result.note).toContain('Processed 2')
    expect(result.note).toContain('live')
    expect(result.errors).toBeUndefined()
  })

  it('keeps failed campaigns honest — left SCHEDULED, not marked sent', () => {
    const result = formatSchedulerResult({
      processed: 0,
      failed: 1,
      pending: 3,
      provider: 'log',
      errors: ['camp-1: gateway error'],
    })
    expect(result.failed).toBe(1)
    expect(result.note).toContain('left SCHEDULED')
    expect(result.note).not.toMatch(/sent successfully/i)
    expect(result.errors).toEqual(['camp-1: gateway error'])
  })
})
