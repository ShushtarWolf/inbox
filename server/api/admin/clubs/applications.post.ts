export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{
    clubName?: string
    city?: string
    contactName?: string
    contactEmail?: string
    contactPhone?: string
    sport?: string
  }>(event)

  const clubName = body.clubName?.trim()
  const city = body.city?.trim()
  const contactName = body.contactName?.trim()
  const contactEmail = body.contactEmail?.trim().toLowerCase()
  if (!clubName || !city || !contactName || !contactEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const application = await prisma.clubApplication.create({
    data: {
      clubName,
      city,
      contactName,
      contactEmail,
      contactPhone: body.contactPhone?.trim() || null,
      sportSlug: body.sport === 'tennis' ? 'tennis' : 'padel',
    },
  })

  return {
    id: application.id,
    status: application.status,
    clubName: application.clubName,
    contactEmail: application.contactEmail,
  }
})
