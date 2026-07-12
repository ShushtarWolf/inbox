import { describe, expect, it } from 'vitest'
import { schedulerStubResult } from './scheduler'

describe('schedulerStubResult', () => {
  it('returns zero processed with pending count', () => {
    const result = schedulerStubResult(3)
    expect(result.processed).toBe(0)
    expect(result.pending).toBe(3)
    expect(result.note).toContain('stub')
  })
})
