import { describe, expect, it, vi, beforeEach } from 'vitest'

const skillFindMany = vi.fn()
const participantFindMany = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    userSportSkillRating: { findMany: (...args: unknown[]) => skillFindMany(...args) },
    openMatchParticipant: { findMany: (...args: unknown[]) => participantFindMany(...args) },
  },
}))

describe('buildAthleteSkillProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    skillFindMany.mockResolvedValue([
      {
        id: 'sk1',
        sportId: 'sp-padel',
        rating: 3.8,
        confidence: 0.4,
        assessmentStatus: 'ASSESSED',
        assessedAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-02-01'),
        matchesPlayed: 2,
        sport: { id: 'sp-padel', slug: 'padel', nameFa: 'پدل', nameEn: 'Padel' },
        history: [
          {
            id: 'h1',
            createdAt: new Date('2026-01-01'),
            previousRating: 3,
            newRating: 3.5,
            reason: 'initial_assessment',
            openMatchId: null,
            metadataJson: null,
          },
          {
            id: 'h2',
            createdAt: new Date('2026-02-01'),
            previousRating: 3.5,
            newRating: 3.8,
            reason: 'post_match',
            openMatchId: 'om-1',
            metadataJson: JSON.stringify({ delta: 0.3 }),
          },
        ],
      },
    ])
    participantFindMany.mockResolvedValue([
      {
        openMatch: {
          id: 'om-1',
          sportId: 'sp-padel',
          status: 'COMPLETED',
          matchType: 'COMPETITIVE',
          completedAt: new Date('2026-02-01'),
          sport: { id: 'sp-padel', slug: 'padel', nameFa: 'پدل' },
          club: { nameFa: 'پدل زون', nameEn: 'PZ' },
          court: { nameFa: 'زمین ۱' },
          slot: { date: '2026-02-01', startTime: '18:00', endTime: '19:00' },
          results: [{ scoreJson: JSON.stringify({ home: 6, away: 4 }) }],
        },
      },
    ])
  })

  it('aggregates per-sport stats and progression', async () => {
    const { buildAthleteSkillProfile } = await import('./athleteSkillProfile')
    const profile = await buildAthleteSkillProfile('user-1')
    expect(profile.sports).toHaveLength(1)
    expect(profile.sports[0]?.rating).toBe(3.8)
    expect(profile.sports[0]?.progression).toHaveLength(2)
    expect(profile.sports[0]?.recentForm[0]).toBe('W')
    expect(profile.recentMatches[0]?.scoreSummary).toBe('6–4')
  })
})