export default defineEventHandler(async (event) => {
  requireAdminSecret(event)

  const applications = await prisma.clubApplication.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
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
