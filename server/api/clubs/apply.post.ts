import { notifyAdminClubApplication } from '../../utils/adminNotify'
import { enforceRateLimit } from '../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'clubs:apply')
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

  const sportSlug = body.sport === 'tennis' ? 'tennis' : 'padel'
  const contactPhone = body.contactPhone?.trim()
  const application = await prisma.clubApplication.create({
    data: {
      clubName,
      city,
      contactName,
      contactEmail,
      contactPhone,
      sportSlug,
    },
  })

  await notifyAdminClubApplication({
    clubName,
    city,
    contactName,
    contactPhone,
    contactEmail,
    sportSlug,
  })

  return { id: application.id, status: application.status }
})
