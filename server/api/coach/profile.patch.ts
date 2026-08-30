import { toSessionUser } from '../../utils/auth'

function isValidMediaUrl(url: string) {
  return /^https?:\/\/.+/i.test(url) || url.startsWith('/uploads/')
}

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({ where: { userId: user.id } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })
  const body = await readBody<{
    bioFa?: string
    bioEn?: string
    sessionPrice?: number
    photo?: string | null
    locale?: string
    credentials?: string[]
  }>(event)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      locale: body.locale === 'en' ? 'en' : body.locale === 'fa' ? 'fa' : undefined,
      avatarUrl: body.photo !== undefined ? (body.photo?.trim() || null) : undefined,
    },
  })

  const photo = body.photo !== undefined ? (body.photo?.trim() || null) : undefined
  if (photo && !isValidMediaUrl(photo)) {
    throw createError({ statusCode: 400, statusMessage: 'photo must be a valid URL' })
  }

  const updatedCoach = await prisma.coach.update({
    where: { id: coach.id },
    data: {
      bioFa: body.bioFa,
      bioEn: body.bioEn ?? body.bioFa,
      sessionPrice: body.sessionPrice !== undefined ? Math.round(body.sessionPrice) : undefined,
      photo,
      credentialsJson: body.credentials !== undefined ? JSON.stringify(body.credentials) : undefined,
    },
  })

  const sessionUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (sessionUser) {
    await setUserSession(event, { user: toSessionUser(sessionUser) })
  }
  return updatedCoach
})
