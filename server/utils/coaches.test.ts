import { describe, expect, it, vi } from 'vitest'
import { assertCoachApproved, PUBLIC_COACH_WHERE } from './coaches'
import { slugify } from './slug'

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number; statusMessage: string }
  err.statusCode = input.statusCode
  err.statusMessage = input.statusMessage
  return err
})

describe('coach slug routing', () => {
  it('slugifies coach names for URL lookup', () => {
    expect(slugify('Sara Mohammadi')).toBe('sara-mohammadi')
  })
})

describe('public coach listing gate', () => {
  it('only lists APPROVED coaches', () => {
    expect(PUBLIC_COACH_WHERE).toEqual({ approvalStatus: 'APPROVED' })
  })

  it('assertCoachApproved allows APPROVED', () => {
    expect(() => assertCoachApproved({ approvalStatus: 'APPROVED' })).not.toThrow()
  })

  it('assertCoachApproved hides PENDING and REJECTED as 404', () => {
    for (const status of ['PENDING', 'REJECTED'] as const) {
      try {
        assertCoachApproved({ approvalStatus: status })
        expect.unreachable(`expected throw for ${status}`)
      }
      catch (err) {
        const e = err as { statusCode?: number; statusMessage?: string }
        expect(e.statusCode).toBe(404)
        expect(e.statusMessage).toBe('Coach not found')
      }
    }
  })
})
