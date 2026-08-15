import { describe, expect, it } from 'vitest'
import { isPlausibleEmail, normalizeOptionalLine, normalizeTicketBody } from './supportTicket.ts'

describe('normalizeTicketBody', () => {
  it('rejects short or empty bodies', () => {
    expect(normalizeTicketBody('hi')).toBeNull()
    expect(normalizeTicketBody('   ')).toBeNull()
    expect(normalizeTicketBody(null)).toBeNull()
  })

  it('accepts a real support message', () => {
    expect(normalizeTicketBody('پرداخت من ثبت نشد لطفا بررسی کنید')).toContain('پرداخت')
  })
})

describe('ticket field helpers', () => {
  it('trims optional lines', () => {
    expect(normalizeOptionalLine('  ali  ', 40)).toBe('ali')
    expect(normalizeOptionalLine('', 40)).toBeNull()
  })

  it('checks a basic email shape', () => {
    expect(isPlausibleEmail('owner@inboxs.ir')).toBe(true)
    expect(isPlausibleEmail('nope')).toBe(false)
  })
})
