export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; email?: string; password?: string; role?: string; locale?: string }>(event)
  const name = body.name?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ''
  const role = ['ATHLETE', 'COACH', 'CLUB_ADMIN'].includes(body.role ?? '') ? body.role! : 'ATHLETE'

  if (!name || !email || password.length < 6) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Email already registered' })
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name,
        email,
        role: role as 'ATHLETE' | 'COACH' | 'CLUB_ADMIN',
        passwordHash: hashSecret(password),
        locale: body.locale === 'en' ? 'en' : 'fa',
      },
    })
    if (role === 'COACH') {
      const sport = await tx.sport.findFirstOrThrow({ where: { slug: 'padel' } })
      await tx.coach.create({
        data: { nameFa: name, nameEn: name, city: 'تهران', sportId: sport.id, userId: created.id },
      })
    }
    if (role === 'CLUB_ADMIN') {
      const sport = await tx.sport.findFirstOrThrow({ where: { slug: 'padel' } })
      const club = await tx.club.create({
        data: {
          slug: `club-${created.id.slice(-6)}`,
          nameFa: name,
          nameEn: name,
          addressFa: 'تهران',
          addressEn: 'Tehran',
          city: 'تهران',
          ownerId: created.id,
          openHour: 8,
          closeHour: 18,
        },
      })
      for (let i = 1; i <= 4; i++) {
        await tx.court.create({
          data: { nameFa: `زمین ${i}`, nameEn: `Court ${i}`, clubId: club.id, sportId: sport.id },
        })
      }
    }
    return created
  })

  await setUserSession(event, { user: toSessionUser(user) })
  return { id: user.id, email: user.email, name: user.name, role: user.role, locale: user.locale }
})
