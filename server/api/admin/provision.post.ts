import { randomBytes } from 'node:crypto'
import { hashSecret } from '../../utils/password'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{
    type?: 'COACH' | 'CLUB_ADMIN'
    email?: string
    name?: string
    clubName?: string
    locale?: string
  }>(event)

  const type = body.type
  const email = body.email?.trim().toLowerCase()
  const name = body.name?.trim()
  if (!type || !email || !name || !['COACH', 'CLUB_ADMIN'].includes(type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  if (type === 'COACH') {
    assertCoachProductEnabled(event)
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Email already registered' })
  }

  const tempPassword = randomBytes(12).toString('base64url')
  const defaultCourtPrice = 600000

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name,
        nameEn: name,
        role: type,
        passwordHash: hashSecret(tempPassword),
        locale: body.locale === 'en' ? 'en' : 'fa',
      },
    })
    if (type === 'COACH') {
      const sport = await tx.sport.findFirstOrThrow({ where: { slug: 'padel' } })
      await tx.coach.create({
        data: { nameFa: name, nameEn: name, city: 'تهران', sportId: sport.id, userId: created.id },
      })
      return { user: created, club: null as null | { id: string; slug: string; nameFa: string } }
    }

    const sport = await tx.sport.findFirstOrThrow({ where: { slug: 'padel' } })
    const clubName = body.clubName?.trim() || name
    const club = await tx.club.create({
      data: {
        slug: `club-${created.id.slice(-8)}`,
        nameFa: clubName,
        nameEn: clubName,
        addressFa: 'تهران',
        addressEn: 'Tehran',
        city: 'تهران',
        ownerId: created.id,
        status: 'ACTIVE',
        openHour: 8,
        closeHour: 22,
        priceFrom: defaultCourtPrice,
      },
    })
    for (let i = 1; i <= 2; i++) {
      await tx.court.create({
        data: {
          nameFa: `زمین ${i}`,
          nameEn: `Court ${i}`,
          clubId: club.id,
          sportId: sport.id,
          price: defaultCourtPrice,
        },
      })
    }
    await tx.staffMembership.create({
      data: {
        userId: created.id,
        clubId: club.id,
        role: 'OWNER',
        permissionsJson: JSON.stringify(['calendar', 'finance', 'crm', 'team', 'settings']),
        active: true,
        isPrimary: true,
      },
    })
    return { user: created, club: { id: club.id, slug: club.slug, nameFa: club.nameFa } }
  })

  return {
    id: result.user.id,
    email: result.user.email,
    role: result.user.role,
    temporaryPassword: tempPassword,
    clubId: result.club?.id ?? null,
    clubSlug: result.club?.slug ?? null,
    clubName: result.club?.nameFa ?? null,
  }
})
