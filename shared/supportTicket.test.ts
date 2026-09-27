import { describe, expect, it } from 'vitest'
import { isPlausibleEmail, normalizeOptionalLine, normalizeTicketBody, openTicketId } from './supportTicket.ts'

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

describe('openTicketId', () => {
  const tickets = [
    { id: 'new', status: 'OPEN' },
    { id: 'old', status: 'IN_PROGRESS' },
    { id: 'done', status: 'RESOLVED' },
  ]

  it('continues the newest open ticket', () => {
    expect(openTicketId(tickets)).toBe('new')
  })

  it('starts a new ticket when asked, or when every ticket is resolved', () => {
    expect(openTicketId(tickets, true)).toBeNull()
    expect(openTicketId([{ id: 'done', status: 'RESOLVED' }])).toBeNull()
  })
})
