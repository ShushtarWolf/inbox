import { iranPhoneStorageVariants } from '#shared/phone.ts'
import { requireApprovedCoach } from '../../../utils/coachClubLinks'
import { coachStudentQuery, mergeCoachStudentHits, type CoachStudentHit } from '../../../utils/coachStudentSearch'

/**
 * Name or phone lookup for the coach booking form.
 * Past students of this coach, plus one exact mobile match so an existing account
 * can be picked without opening the whole user directory.
 */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await requireApprovedCoach(user.id)
  const parsed = coachStudentQuery(String(getQuery(event).q || ''))
  if (!parsed) return { students: [] as CoachStudentHit[] }

  const phoneFilter = parsed.phoneContains
    ? [{ phone: { contains: parsed.phoneContains } }]
    : []

  const [past, exactUser] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { not: user.id },
        coachSessions: { some: { coachId: coach.id } },
        OR: [
          { name: { contains: parsed.q, mode: 'insensitive' } },
          { nameEn: { contains: parsed.q, mode: 'insensitive' } },
          ...phoneFilter,
        ],
      },
      select: { name: true, phone: true },
      orderBy: { name: 'asc' },
      take: 12,
    }),
    parsed.exactPhone
      ? prisma.user.findFirst({
          where: {
            id: { not: user.id },
            phone: { in: iranPhoneStorageVariants(parsed.exactPhone) },
          },
          select: { name: true, phone: true },
        })
      : Promise.resolve(null),
  ])

  const students = mergeCoachStudentHits(
    past.map((row) => ({ name: row.name || '', mobile: row.phone || '' })),
    exactUser ? { name: exactUser.name || '', mobile: exactUser.phone || '' } : null,
  )

  return { students }
})
