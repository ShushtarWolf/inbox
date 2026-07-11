export default defineEventHandler(async (event) => {
  enforceRateLimit(event, 'auth:register-coach')
  const body = await readBody<{
    name?: string
    email?: string
    password?: string
    locale?: string
    clubId?: string
    bioFa?: string
    bioEn?: string
    sessionPrice?: number
    avatarUrl?: string
    credentialUrls?: string[]
  }>(event)

  const name = body.name?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ''
  const clubId = body.clubId?.trim()

  if (!name || !email || password.length < 6 || !clubId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const club = await prisma.club.findFirst({ where: { id: clubId, status: 'ACTIVE' } })
  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Email already registered' })
  }

  const court = await prisma.court.findFirst({ where: { clubId: club.id }, include: { sport: true } })
  const sport = court?.sport || await prisma.sport.findFirstOrThrow({ where: { slug: 'padel' } })
  const locale = body.locale === 'en' ? 'en' : 'fa'
  const sessionPrice = body.sessionPrice !== undefined ? Math.max(0, Math.round(body.sessionPrice)) : 400000

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        nameEn: name,
        email,
        role: 'COACH',
        passwordHash: hashSecret(password),
        locale,
        avatarUrl: body.avatarUrl?.trim() || null,
      },
    })

    const coach = await tx.coach.create({
      data: {
        nameFa: name,
        nameEn: name,
        city: club.city,
        sportId: sport.id,
        clubId: club.id,
        userId: user.id,
        bioFa: body.bioFa?.trim() || null,
        bioEn: body.bioEn?.trim() || body.bioFa?.trim() || null,
        sessionPrice,
        photo: body.avatarUrl?.trim() || null,
        credentialsJson: body.credentialUrls?.length ? JSON.stringify(body.credentialUrls) : null,
        isBookable: true,
      },
    })

    const defaultDays = [1, 2, 3, 4, 5]
    await tx.coachAvailability.createMany({
      data: defaultDays.map((dayOfWeek) => ({
        coachId: coach.id,
        dayOfWeek,
        startTime: '09:00',
        endTime: '17:00',
      })),
    })

    return { user, coach }
  })

  await setUserSession(event, { user: toSessionUser(result.user) })
  return {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    role: result.user.role,
    locale: result.user.locale,
    coachId: result.coach.id,
    redirectTo: postLoginRedirectPath(result.user, locale),
  }
})
