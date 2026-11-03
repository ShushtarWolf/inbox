import { beforeEach, describe, expect, it, vi } from 'vitest'

const findMany = vi.fn()
const update = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    moneyJob: {
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}))

import { requeueFailedMoneyJobs } from './moneyJobs'

describe('requeueFailedMoneyJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    update.mockResolvedValue({})
  })

  it('marks FAILED jobs PENDING again', async () => {
    findMany.mockResolvedValue([{ id: 'j1' }, { id: 'j2' }])
    const result = await requeueFailedMoneyJobs()
    expect(result.requeued).toBe(2)
    expect(update).toHaveBeenCalledTimes(2)
  })
})
