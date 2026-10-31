export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const rows = await prisma.discountMembership.findMany({
    where: { clubId: club.id, revokedAt: null },
    orderBy: { approvedAt: 'desc' },
    take: 200,
    include: {
      user: { select: { id: true, name: true, phone: true } },
      program: { select: { id: true, titleFa: true, titleEn: true, active: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    percent: row.percent,
    labelFa: row.labelFa,
    labelEn: row.labelEn,
    approvedAt: row.approvedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() || null,
    user: row.user,
    program: row.program,
  }))
})
