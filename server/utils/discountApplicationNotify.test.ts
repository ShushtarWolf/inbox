import { beforeEach, describe, expect, it, vi } from 'vitest'

const clubSideNotifyPhones = vi.fn()
const notifySmsSoft = vi.fn()

vi.mock('./bookingNotify', () => ({
  clubNotifyName: (club: { nameFa?: string }) => club.nameFa || 'باشگاه',
  clubSideNotifyPhones: (...args: unknown[]) => clubSideNotifyPhones(...args),
  notifySmsSoft: (...args: unknown[]) => notifySmsSoft(...args),
}))

describe('notifyOwnerStudentCardSubmitted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clubSideNotifyPhones.mockResolvedValue(['09121111111'])
    notifySmsSoft.mockResolvedValue(true)
  })

  it('sends OWNER_STUDENT_CARD_SUBMITTED to club-side phones', async () => {
    const { notifyOwnerStudentCardSubmitted } = await import('./discountApplicationNotify.ts')
    await notifyOwnerStudentCardSubmitted({
      clubId: 'club-1',
      clubName: 'علم و صنعت',
      programTitle: 'تخفیف دانشجویی تنیس',
      athleteName: 'علی رضایی',
    })
    expect(clubSideNotifyPhones).toHaveBeenCalledWith(undefined, 'club-1')
    expect(notifySmsSoft).toHaveBeenCalledWith(
      '09121111111',
      'OWNER_STUDENT_CARD_SUBMITTED',
      expect.objectContaining({
        clubName: 'علم و صنعت',
        programTitle: 'تخفیف دانشجویی تنیس',
        athleteName: 'علی رضایی',
      }),
      'club-1',
    )
  })

  it('skips SMS when no club-side phones', async () => {
    clubSideNotifyPhones.mockResolvedValue([])
    const { notifyOwnerStudentCardSubmitted } = await import('./discountApplicationNotify.ts')
    await notifyOwnerStudentCardSubmitted({
      clubId: 'club-1',
      clubName: 'تست',
      programTitle: 'طرح',
      athleteName: 'کاربر',
    })
    expect(notifySmsSoft).not.toHaveBeenCalled()
  })
})