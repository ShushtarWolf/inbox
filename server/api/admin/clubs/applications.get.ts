export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : undefined
  const allowed = ['PENDING', 'APPROVED', 'REJECTED'] as const

  const applications = await prisma.clubApplication.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    where: {
      ...(status && allowed.includes(status as (typeof allowed)[number])
        ? { status: status as (typeof allowed)[number] }
        : {}),
    },
    include: {
      club: { select: { id: true, slug: true } },
    },
  })

  return {
    applications: applications.map((app) => ({
      id: app.id,
      clubName: app.clubName,
      city: app.city,
      contactName: app.contactName,
      contactEmail: app.contactEmail,
      contactPhone: app.contactPhone,
      sportSlug: app.sportSlug,
      status: app.status,
      createdAt: app.createdAt.toISOString(),
      clubId: app.clubId,
      clubSlug: app.club?.slug || null,
    })),
  }
})
