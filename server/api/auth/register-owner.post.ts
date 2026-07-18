import { ALL_OWNER_PERMISSIONS } from '#shared/ownerPermissions.ts'
import { uniqueClubSlug } from '../../utils/slug'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:register-owner')
  const body = await readBody<{
    name?: string
    email?: string
    password?: string
    locale?: string
    phone?: string
    clubNameFa?: string
    clubNameEn?: string
    city?: string
    addressFa?: string
    addressEn?: string
    sport?: string
    avatarUrl?: string
    clubImage?: string
    galleryUrls?: string[]
    credentialUrls?: string[]
  }>(event)

  const name = body.name?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ''
  const clubNameFa = body.clubNameFa?.trim() || body.clubNameEn?.trim()
  const clubNameEn = body.clubNameEn?.trim() || clubNameFa
  const city = body.city?.trim()
  const addressFa = body.addressFa?.trim() || city
  const addressEn = body.addressEn?.trim() || city

  if (!name || !email || password.length < 6 || !clubNameFa || !city) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  rejectDemoEmailInProduction(email)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Email already registered' })
  }

  const sport = await prisma.sport.findFirstOrThrow({
    where: { slug: body.sport === 'tennis' ? 'tennis' : 'padel' },
  })
  const slug = await uniqueClubSlug(clubNameEn || clubNameFa!)
  const locale = body.locale === 'en' ? 'en' : 'fa'

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        nameEn: name,
        email,
        role: 'CLUB_ADMIN',
        passwordHash: hashSecret(password),
        locale,
        phone: body.phone?.trim() || null,
        avatarUrl: body.avatarUrl?.trim() || null,
      },
    })

    const club = await tx.club.create({
      data: {
        slug,
        nameFa: clubNameFa!,
        nameEn: clubNameEn!,
        addressFa: addressFa!,
        addressEn: addressEn!,
        city: city!,
        ownerId: user.id,
        status: 'ACTIVE',
        image: body.clubImage?.trim() || null,
        credentialsJson: body.credentialUrls?.length ? JSON.stringify(body.credentialUrls) : null,
        phone: body.phone?.trim() || null,
      },
    })

    await tx.court.create({
      data: {
        nameFa: 'زمین ۱',
        nameEn: 'Court 1',
        clubId: club.id,
        sportId: sport.id,
      },
    })

    await tx.staffMembership.create({
      data: {
        userId: user.id,
        clubId: club.id,
        role: 'OWNER',
        permissionsJson: JSON.stringify(ALL_OWNER_PERMISSIONS),
        active: true,
        isPrimary: true,
      },
    })

    if (body.galleryUrls?.length) {
      await tx.clubMedia.createMany({
        data: body.galleryUrls.map((url, index) => ({
          clubId: club.id,
          url,
          sortOrder: index,
        })),
      })
    }

    return { user, club }
  })

  await setUserSession(event, { user: toSessionUser(result.user) })
  await touchLastLogin(result.user.id)
  return {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    role: result.user.role,
    locale: result.user.locale,
    clubId: result.club.id,
    redirectTo: postLoginRedirectPath(result.user, locale),
  }
})
