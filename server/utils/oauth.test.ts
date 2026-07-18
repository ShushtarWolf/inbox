import { beforeEach, describe, expect, it, vi } from 'vitest'

const findFirst = vi.fn()
const findUnique = vi.fn()
const update = vi.fn()
const create = vi.fn()

vi.stubGlobal('prisma', {
  user: { findFirst, findUnique, update, create },
})

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})

import { upsertGoogleUser } from './oauth'

describe('upsertGoogleUser', () => {
  beforeEach(() => {
    findFirst.mockReset()
    findUnique.mockReset()
    update.mockReset()
    create.mockReset()
  })

  it('creates new users as ATHLETE', async () => {
    findFirst.mockResolvedValue(null)
    findUnique.mockResolvedValue(null)
    create.mockResolvedValue({
      id: 'u1',
      email: 'new@example.com',
      role: 'ATHLETE',
    })

    const user = await upsertGoogleUser({
      sub: 'google-sub-1',
      email: 'new@example.com',
      name: 'New Athlete',
    }, 'fa')

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'new@example.com',
        role: 'ATHLETE',
        oauthProvider: 'google',
        oauthSubject: 'google-sub-1',
        locale: 'fa',
      }),
    })
    expect(user.role).toBe('ATHLETE')
  })

  it('returns existing oauth user without create', async () => {
    findFirst.mockResolvedValue({ id: 'u2', email: 'existing@example.com', role: 'ATHLETE' })
    const user = await upsertGoogleUser({ sub: 'google-sub-2', email: 'existing@example.com' })
    expect(create).not.toHaveBeenCalled()
    expect(user.id).toBe('u2')
  })
})
