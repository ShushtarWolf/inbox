import {
  isDiscountMembershipActive,
  membershipDiscountCode,
} from '#shared/discountMembership.ts'
import { parseProofUrls } from '../../utils/discountMemberships'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  let clubId = typeof query.clubId === 'string' ? query.clubId : ''
  const clubSlug = typeof query.clubSlug === 'string' ? query.clubSlug : ''

  if (!clubId && clubSlug) {
    const club = await prisma.club.findUnique({
      where: { slug: clubSlug },
      select: { id: true },
    })
    clubId = club?.id || ''
  }
  if (!clubId) throw createError({ statusCode: 400, statusMessage: 'clubId required' })

  const session = await getUserSession(event)
  const userId = session?.user?.id || null
  const now = new Date()

  const programs = await prisma.discountProgram.findMany({
    where: { clubId, active: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      titleFa: true,
      titleEn: true,
      percent: true,
      instructionsFa: true,
      instructionsEn: true,
      validityMonths: true,
      verificationKind: true,
    },
  })

  if (!userId) {
    return {
      programs,
      membership: null,
      applicationByProgramId: {} as Record<string, unknown>,
    }
  }

  const [memberships, applications] = await Promise.all([
    prisma.discountMembership.findMany({
      where: {
        clubId,
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        program: { active: true },
      },
      select: {
        id: true,
        percent: true,
        labelFa: true,
        labelEn: true,
        expiresAt: true,
        revokedAt: true,
        programId: true,
        program: { select: { active: true } },
      },
    }),
    prisma.discountApplication.findMany({
      where: {
        clubId,
        userId,
        programId: { in: programs.map((p) => p.id) },
      },
      select: {
        id: true,
        programId: true,
        status: true,
        rejectReason: true,
        proofUrlsJson: true,
        createdAt: true,
      },
    }),
  ])

  const activeMemberships = memberships.filter((row) =>
    isDiscountMembershipActive({ ...row, programActive: row.program.active }, now),
  )
  activeMemberships.sort((a, b) => b.percent - a.percent)
  const best = activeMemberships[0] || null

  const applicationByProgramId: Record<string, {
    id: string
    status: string
    rejectReason: string | null
    proofUrls: string[]
    createdAt: string
  }> = {}
  for (const app of applications) {
    applicationByProgramId[app.programId] = {
      id: app.id,
      status: app.status,
      rejectReason: app.rejectReason,
      proofUrls: parseProofUrls(app.proofUrlsJson),
      createdAt: app.createdAt.toISOString(),
    }
  }

  return {
    programs,
    membership: best
      ? {
          id: best.id,
          programId: best.programId,
          percent: best.percent,
          labelFa: best.labelFa,
          labelEn: best.labelEn,
          code: membershipDiscountCode(best.id),
          expiresAt: best.expiresAt?.toISOString() || null,
        }
      : null,
    applicationByProgramId,
  }
})
