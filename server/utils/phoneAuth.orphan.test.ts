import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateMany = vi.fn()

vi.stubGlobal('prisma', {
  booking: {
    updateMany,
  },
})

describe('linkOrphanBookingsByPhone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateMany.mockResolvedValue({ count: 1 })
  })

  it('links orphan desk bookings to the new user id by guestMobile variants', async () => {
    const { linkOrphanBookingsByPhone } = await import('./phoneAuth')
    const count = await linkOrphanBookingsByPhone('user-new', '09121234567')
    expect(count).toBe(1)
    const call = updateMany.mock.calls[0]?.[0]
    expect(call?.data).toEqual({ userId: 'user-new' })
    expect(call?.where?.userId).toBe(null)
    expect(call?.where?.guestMobile?.in).toContain('09121234567')
  })

  it('no-ops for empty phone', async () => {
    const { linkOrphanBookingsByPhone } = await import('./phoneAuth')
    await expect(linkOrphanBookingsByPhone('user-new', '')).resolves.toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
  })
})