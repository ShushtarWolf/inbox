import { describe, expect, it } from 'vitest'
import { affiliatedTransferCoachWhere } from './transferCoaches'

describe('affiliatedTransferCoachWhere', () => {
  it('requires approved coach with user + club home or staff link', () => {
    const where = affiliatedTransferCoachWhere('club-home')

    expect(where).toEqual({
      AND: [
        { approvalStatus: 'APPROVED' },
        { userId: { not: null } },
        {
          OR: [
            { clubId: 'club-home' },
            { membershipLinks: { some: { clubId: 'club-home', active: true } } },
            {
              user: {
                memberships: {
                  some: { clubId: 'club-home', active: true, role: 'COACH' },
                },
              },
            },
          ],
        },
      ],
    })
  })

  it('scopes OR clauses to the requested club only (foreign club cannot match)', () => {
    const where = affiliatedTransferCoachWhere('club-a')
    const and = where.AND as Array<Record<string, unknown>>
    const link = and[2] as { OR: Array<Record<string, unknown>> }

    expect(link.OR).toEqual(
      expect.arrayContaining([
        { clubId: 'club-a' },
        { membershipLinks: { some: { clubId: 'club-a', active: true } } },
      ]),
    )
    expect(JSON.stringify(where)).not.toContain('club-b')
  })
})
