import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = vi.hoisted(() => ({
  public: { externalCalendarModule: true },
}))

vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)

const assertExternalBookingAllowed = vi.hoisted(() => vi.fn())

vi.mock('../../modules/inbox-external-calendar/runtime/server/lib/bookingGuard', () => ({
  assertExternalBookingAllowed,
}))

import { assertExternalBookingAllowedIfEnabled } from './externalBookingGuard'

describe('assertExternalBookingAllowedIfEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeConfig.public.externalCalendarModule = true
  })

  it('no-ops when external calendar module is disabled', async () => {
    runtimeConfig.public.externalCalendarModule = false
    await assertExternalBookingAllowedIfEnabled({
      club: {
        id: 'club-1',
        slug: 'iust-tennis',
        defaultSessionDurationMinutes: 60,
        openHour: 7,
        closeHour: 23,
      },
      slots: [{ courtId: 'c1', date: '2026-09-14', startTime: '18:00' }],
    })
    expect(assertExternalBookingAllowed).not.toHaveBeenCalled()
  })

  it('delegates to module guard when enabled', async () => {
    await assertExternalBookingAllowedIfEnabled({
      club: {
        id: 'club-1',
        slug: 'iust-tennis',
        defaultSessionDurationMinutes: 60,
        openHour: 7,
        closeHour: 23,
      },
      slots: [{ courtId: 'c1', date: '2026-09-14', startTime: '18:00' }],
    })
    expect(assertExternalBookingAllowed).toHaveBeenCalledOnce()
  })
})
