import { describe, expect, it, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const create = vi.fn()
const update = vi.fn()
const historyCreate = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    userSportSkillRating: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      create: (...args: unknown[]) => create(...args),
      update: (...args: unknown[]) => update(...args),
    },
    skillRatingHistory: {
      create: (...args: unknown[]) => historyCreate(...args),
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      userSportSkillRating: {
        findUnique: (...args: unknown[]) => findUnique(...args),
        create: (...args: unknown[]) => create(...args),
        update: (...args: unknown[]) => update(...args),
      },
      skillRatingHistory: { create: (...args: unknown[]) => historyCreate(...args) },
    }),
  },
}))

import { submitSkillAssessment } from './skillRating'

describe('submitSkillAssessment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findUnique.mockResolvedValue({
      id: 'skill-1',
      rating: 3,
      confidence: 0,
      assessmentStatus: 'UNASSESSED',
    })
    update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'skill-1',
      sportId: 'sport-1',
      ...data,
    }))
  })

  it('writes assessed rating and history', async () => {
    const result = await submitSkillAssessment({
      userId: 'u1',
      sportId: 'sport-1',
      answers: {
        experienceYears: 5,
        matchesPerMonth: 12,
        techniqueSelf: 4,
        tacticsSelf: 4,
      },
    })
    expect(result.assessmentStatus).toBe('ASSESSED')
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: 'initial_assessment' }) }),
    )
  })
})