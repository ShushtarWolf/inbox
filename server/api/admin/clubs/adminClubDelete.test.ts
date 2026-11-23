import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const assessClubDeletionBlockers = vi.fn()
const deleteClubWithDependents = vi.fn()
const requireAdminSecret = vi.fn()
const findUnique = vi.fn()
const $transaction = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', createError)
vi.stubGlobal('getRouterParam', (_e: unknown, key: string) => (key === 'id' ? 'club-1' : undefined))
vi.stubGlobal('requireAdminSecret', (...args: unknown[]) => requireAdminSecret(...args))
vi.stubGlobal('prisma', {
  club: { findUnique },
  $transaction,
})

vi.mock('../../../utils/adminClubDelete.ts', () => ({
  assessClubDeletionBlockers: (...args: unknown[]) => assessClubDeletionBlockers(...args),
  deleteClubWithDependents: (...args: unknown[]) => deleteClubWithDependents(...args),
  CLUB_DELETE_BLOCKED_MESSAGE: 'حذف این باشگاه ممکن نیست؛ رزرو، پرداخت یا سابقه مالی ثبت شده است.',
}))

describe('DELETE /api/admin/clubs/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminSecret.mockImplementation(() => {})
    findUnique.mockResolvedValue({ id: 'club-1', nameFa: 'باشگاه تست', slug: 'test-club' })
    assessClubDeletionBlockers.mockResolvedValue(null)
    $transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}))
    deleteClubWithDependents.mockResolvedValue(undefined)
  })

  it('requires admin secret', async () => {
    requireAdminSecret.mockImplementation(() => {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    })
    const handler = (await import('./[id]/index.delete')).default as (e: unknown) => Promise<unknown>
    await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('deletes a clean club', async () => {
    const handler = (await import('./[id]/index.delete')).default as (e: unknown) => Promise<{
      ok: boolean
      deletedClubId: string
      clubName: string
    }>
    const result = await handler({})
    expect(result).toEqual({ ok: true, deletedClubId: 'club-1', clubName: 'باشگاه تست' })
    expect(deleteClubWithDependents).toHaveBeenCalled()
  })

  it('returns 409 when bookings or financial history exists', async () => {
    assessClubDeletionBlockers.mockResolvedValue('booking')
    const handler = (await import('./[id]/index.delete')).default as (e: unknown) => Promise<unknown>
    await expect(handler({})).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: expect.stringContaining('حذف'),
    })
    expect($transaction).not.toHaveBeenCalled()
    expect(deleteClubWithDependents).not.toHaveBeenCalled()
  })
})