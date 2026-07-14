export default defineEventHandler(async (event) => {
  requireAdminSecret(event)

  const query = getQuery(event)
  const statusFilter = query.status === 'OPEN' || query.status === 'RESOLVED' ? query.status : undefined

  const reports = await prisma.bugReport.findMany({
    where: statusFilter ? { status: statusFilter } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: { select: { id: true, email: true, name: true, nameEn: true } },
    },
  })

  return {
    reports: reports.map((report) => ({
      id: report.id,
      description: report.description,
      screenshotUrl: report.screenshotUrl,
      pageUrl: report.pageUrl,
      userAgent: report.userAgent,
      reporterEmail: report.reporterEmail,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() || null,
      user: report.user
        ? {
            id: report.user.id,
            email: report.user.email,
            name: report.user.name,
            nameEn: report.user.nameEn,
          }
        : null,
    })),
  }
})
