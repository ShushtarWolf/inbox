import { createError } from 'h3'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const findMany = vi.fn()
const requireUser = vi.fn()

beforeAll(() => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('requireUser', (...args: unknown[]) => requireUser(...args))
  vi.stubGlobal('prisma', {
    discountApplication: { findMany },
  })
})

beforeEach(() => {
  findMany.mockReset()
  requireUser.mockReset()
})

describe('GET /api/discount-applications/mine', () => {
  it('returns student verification rows for the athlete', async () => {
    requireUser.mockResolvedValue({ id: 'u1' })
    findMany.mockResolvedValue([
      {
        id: 'app1',
        status: 'PENDING',
        rejectReason: null,
        proofUrlsJson: '["/uploads/card.jpg"]',
        updatedAt: new Date('2026-11-26T12:00:00.000Z'),
        club: { id: 'c1', nameFa: 'IUST', slug: 'iust-tennis' },
        program: { id: 'p1', percent: 50, titleFa: 'تخفیف دانشجویی' },
      },
    ])

    const handler = (await import('./mine.get')).default as () => Promise<{ items: unknown[] }>
    const out = await handler()

    expect(out.items).toHaveLength(1)
    expect(out.items[0]).toMatchObject({
      status: 'PENDING',
      clubSlug: 'iust-tennis',
      proofUrl: '/uploads/card.jpg',
    })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1' }),
      }),
    )
  })
})