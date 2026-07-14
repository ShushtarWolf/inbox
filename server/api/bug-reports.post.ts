export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.public.bugReportsEnabled) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  await enforceRateLimit(event, 'bug-reports')

  const body = await readBody<{
    description?: string
    screenshotUrl?: string
    pageUrl?: string
    userAgent?: string
    reporterEmail?: string
  }>(event)

  const description = body.description?.trim()
  const pageUrl = body.pageUrl?.trim()
  if (!description || description.length < 10) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  if (!pageUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const session = await getUserSession(event)
  const reporterEmail = body.reporterEmail?.trim().toLowerCase() || session?.user?.email || null

  const report = await prisma.bugReport.create({
    data: {
      description,
      screenshotUrl: body.screenshotUrl?.trim() || null,
      pageUrl,
      userAgent: body.userAgent?.trim() || null,
      reporterEmail,
      userId: session?.user?.id || null,
    },
  })

  return { id: report.id, status: report.status }
})
