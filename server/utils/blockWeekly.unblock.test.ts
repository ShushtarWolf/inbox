import { beforeEach, describe, expect, it, vi } from 'vitest'

const prisma = {
  slot: { findFirst: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
  booking: { delete: vi.fn() },
}

vi.mock('./prisma', () => ({ prisma }))
vi.mock('./cancellations', () => ({ cancelCourtBooking: vi.fn() }))

describe('unblock desk hold (IB-17)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
  })

  it('deletes CLUB hold without payment instead of cancel+phantom finance row', async () => {
    prisma.slot.findFirst.mockResolvedValue({
      id: 'slot-1',
      displayStatus: 'BLOCKED',
      booking: {
        id: 'b1',
        source: 'CLUB',
        status: 'CONFIRMED',
        userId: null,
        packageDraftId: null,
        coachId: null,
        payment: null,
      },
    })

    const { applyUnblockSlotIds } = await import('./blockWeekly')
    await applyUnblockSlotIds({ clubId: 'club-1', slotIds: ['slot-1'] })

    expect(prisma.booking.delete).toHaveBeenCalledWith({ where: { id: 'b1' } })
    expect(prisma.slot.update).toHaveBeenCalledWith({
      where: { id: 'slot-1' },
      data: { displayStatus: 'FREE' },
    })
    const { cancelCourtBooking } = await import('./cancellations')
    expect(cancelCourtBooking).not.toHaveBeenCalled()
  })
})