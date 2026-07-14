export default defineEventHandler(async (event) => {
  requireAdminSecret(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const body = await readBody<{ status?: string }>(event)
  if (body.status !== 'OPEN' && body.status !== 'RESOLVED') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const existing = await prisma.bugReport.findUnique({ where: { id } })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const report = await prisma.bugReport.update({
    where: { id },
    data: {
      status: body.status,
      resolvedAt: body.status === 'RESOLVED' ? new Date() : null,
    },
  })

  return {
    id: report.id,
    status: report.status,
    resolvedAt: report.resolvedAt?.toISOString() || null,
  }
})
