import { parseProofUrls } from '../../utils/discountMemberships'

/** Athlete hub/profile: student-card verification rows across clubs. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const rows = await prisma.discountApplication.findMany({
    where: {
      userId: user.id,
      program: { verificationKind: 'STUDENT' },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      status: true,
      rejectReason: true,
      proofUrlsJson: true,
      updatedAt: true,
      club: { select: { id: true, nameFa: true, slug: true } },
      program: { select: { id: true, percent: true, titleFa: true } },
    },
  })

  return {
    items: rows.map((row) => {
      const proofUrls = parseProofUrls(row.proofUrlsJson)
      return {
        id: row.id,
        status: row.status,
        rejectReason: row.rejectReason,
        clubId: row.club.id,
        clubName: row.club.nameFa,
        clubSlug: row.club.slug,
        programId: row.program.id,
        programTitle: row.program.titleFa,
        programPercent: row.program.percent,
        proofUrl: proofUrls[0] || null,
        updatedAt: row.updatedAt.toISOString(),
      }
    }),
  }
})