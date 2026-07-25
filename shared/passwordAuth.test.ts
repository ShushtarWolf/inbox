import { describe, expect, it } from 'vitest'
import { isPasswordLongEnough, resolvePasswordRegisterIdentity } from './passwordAuth'

describe('resolvePasswordRegisterIdentity', () => {
  it('uses phone + synthetic email when email omitted', () => {
    expect(resolvePasswordRegisterIdentity({ phone: '09123456789' })).toEqual({
      phone: '09123456789',
      email: 'phone.09123456789@users.inbox.local',
    })
  })

  it('keeps real email when provided with phone', () => {
    expect(
      resolvePasswordRegisterIdentity({ phone: '09123456789', email: 'a@example.com' }),
    ).toEqual({
      phone: '09123456789',
      email: 'a@example.com',
    })
  })

  it('allows email-only registration', () => {
    expect(resolvePasswordRegisterIdentity({ email: 'Athlete@Example.com' })).toEqual({
      phone: null,
      email: 'athlete@example.com',
    })
  })

  it('rejects empty identity', () => {
    expect(resolvePasswordRegisterIdentity({})).toBeNull()
    expect(resolvePasswordRegisterIdentity({ phone: '123', email: 'not-an-email' })).toBeNull()
  })
})

describe('isPasswordLongEnough', () => {
  it('requires at least 6 characters', () => {
    expect(isPasswordLongEnough('12345')).toBe(false)
    expect(isPasswordLongEnough('123456')).toBe(true)
  })
})
