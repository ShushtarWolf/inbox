import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueSetting = vi.fn()
const findManyChanges = vi.fn()

vi.stubGlobal('prisma', {
  platformCommissionSetting: {
    findUnique: (...args: unknown[]) => findUniqueSetting(...args),
  },
  platformCommissionChange: {
    findMany: (...args: unknown[]) => findManyChanges(...args),
  },
})

describe('loadPlatformCommissionBps', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.PLATFORM_COMMISSION_BPS
    findManyChanges.mockResolvedValue([])
  })

  afterEach(() => {
    delete process.env.PLATFORM_COMMISSION_BPS
  })

  it('reads commission from database when row exists', async () => {
    findUniqueSetting.mockResolvedValue({ commissionBps: 750 })
    const { loadPlatformCommissionBps, invalidatePlatformCommissionCache } = await import('./platformCommission.ts')
    invalidatePlatformCommissionCache()
    await expect(loadPlatformCommissionBps()).resolves.toBe(750)
  })

  it('falls back to env when database row is missing', async () => {
    findUniqueSetting.mockResolvedValue(null)
    process.env.PLATFORM_COMMISSION_BPS = '500'
    const { loadPlatformCommissionBps, invalidatePlatformCommissionCache } = await import('./platformCommission.ts')
    invalidatePlatformCommissionCache()
    await expect(loadPlatformCommissionBps()).resolves.toBe(500)
  })

  it('defaults to 0 when database and env are unset', async () => {
    findUniqueSetting.mockResolvedValue(null)
    const { loadPlatformCommissionBps, invalidatePlatformCommissionCache } = await import('./platformCommission.ts')
    invalidatePlatformCommissionCache()
    await expect(loadPlatformCommissionBps()).resolves.toBe(0)
  })
})
