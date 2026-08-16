import { ALL_OWNER_PERMISSIONS } from '#shared/ownerPermissions.ts'
import { isPasswordLongEnough, resolvePasswordRegisterIdentity } from '#shared/passwordAuth.ts'
import { assignAddedRole, canAddRole } from '#shared/roles.ts'
import { uniqueClubSlug } from '../../utils/slug'
import {
  normalizeOwnerCourtCount,
  normalizeOwnerSport,
  ownerSetupHandoff,
  sportSlugsForOwner,
} from '../../utils/ownerOnboarding'
import { createPendingOwnerApplication } from '../../utils/ownerSignupApplication'
import { notifyAdminClubApplication } from '../../utils/adminNotify'
import { toSessionUser, touchLastLogin } from '../../utils/auth'

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
    courtCount?: number | string
    avatarUrl?: string
    clubImage?: string
    galleryUrls?: string[]
    credentialUrls?: string[]
    returnTo?: string
  }>(event)

  const clubNameFa = body.clubNameFa?.trim() || body.clubNameEn?.trim()
  const clubNameEn = body.clubNameEn?.trim() || clubNameFa
  const name = body.name?.trim() || clubNameFa
  const password = body.password ?? ''
  const identity = resolvePasswordRegisterIdentity({
    phone: body.phone,
    email: body.email,
  })
  if (body.phone?.trim() && !identity?.phone) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid phone' })
  }
  const email = identity?.email
  const phone = identity?.phone || null
  const city = body.city?.trim() || 'تهران'
  const addressFa = body.addressFa?.trim() || city
  const addressEn = body.addressEn?.trim() || addressFa
  const sportKey = normalizeOwnerSport(body.sport)
  const courtCount = normalizeOwnerCourtCount(body.courtCount)
  const setupHandoff = ownerSetupHandoff(sportKey, courtCount)

  if (!name || !email || !isPasswordLongEnough(password) || !clubNameFa) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  rejectDemoEmailInProduction(email)

  const existingByEmail = await prisma.user.findUnique({ where: { email } })
  const existingByPhone = phone
    ? await prisma.user.findUnique({ where: { phone } })
    : null
  if (existingByEmail && existingByPhone && existingByEmail.id !== existingByPhone.id) {
    throw createError({ statusCode: 409, statusMessage: 'Email and phone belong to different accounts' })
  }
  const existingUser = existingByEmail || existingByPhone
  if (existingUser && !canAddRole(existingUser, 'CLUB_ADMIN')) {
    throw createError({
      statusCode: 409,
      statusMessage: existingByEmail ? 'Email already registered' : 'Phone already registered',
    })
  }

  const sportSlugs = sportSlugsForOwner(sportKey)
  const sports = await prisma.sport.findMany({
    where: { slug: { in: sportSlugs } },
  })
  const sportBySlug = Object.fromEntries(sports.map((s) => [s.slug, s]))
  for (const slug of sportSlugs) {
    if (!sportBySlug[slug]) {
      throw createError({ statusCode: 500, statusMessage: `Sport missing: ${slug}` })
    }
  }

  const clubSlug = await uniqueClubSlug(clubNameEn || clubNameFa!)
  const locale = body.locale === 'en' ? 'en' : 'fa'

  const result = await prisma.$transaction(async (tx) => {
    let user
    if (existingUser) {
      const assigned = assignAddedRole(existingUser, 'CLUB_ADMIN')
      if (!assigned) {
        throw createError({ statusCode: 409, statusMessage: 'Phone already registered' })
      }
      user = await tx.user.update({
        where: { id: existingUser.id },
        data: {
          role: assigned.role,
          secondaryRole: assigned.secondaryRole,
          passwordHash: hashSecret(password),
          ...(phone && !existingUser.phone ? { phone } : {}),
          avatarUrl: body.avatarUrl?.trim() || existingUser.avatarUrl,
        },
      })
    } else {
      user = await tx.user.create({
        data: {
          name,
          nameEn: name,
          email,
          role: 'CLUB_ADMIN',
          passwordHash: hashSecret(password),
          locale,
          phone,
          phoneVerifiedAt: null,
          avatarUrl: body.avatarUrl?.trim() || null,
        },
      })
    }

    const club = await tx.club.create({
      data: {
        slug: clubSlug,
        nameFa: clubNameFa!,
        nameEn: clubNameEn!,
        addressFa: addressFa!,
        addressEn: addressEn!,
        city: city!,
        ownerId: user.id,
        status: 'PENDING',
        image: body.clubImage?.trim() || null,
        credentialsJson: body.credentialUrls?.length ? JSON.stringify(body.credentialUrls) : null,
        phone,
      },
    })

    for (let index = 0; index < courtCount; index++) {
      const slug = sportSlugs[index % sportSlugs.length]!
      const sport = sportBySlug[slug]!
      await tx.court.create({
        data: {
          nameFa: `زمین ${index + 1}`,
          nameEn: `Court ${index + 1}`,
          clubId: club.id,
          sportId: sport.id,
        },
      })
    }

    const hasMembership = await tx.staffMembership.findFirst({
      where: { userId: user.id, active: true },
      select: { id: true },
    })

    await tx.staffMembership.create({
      data: {
        userId: user.id,
        clubId: club.id,
        role: 'OWNER',
        permissionsJson: JSON.stringify(ALL_OWNER_PERMISSIONS),
        active: true,
        isPrimary: !hasMembership,
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

    await createPendingOwnerApplication(tx, {
      clubId: club.id,
      clubName: clubNameFa!,
      city: city!,
      contactName: name,
      contactEmail: user.email,
      contactPhone: phone,
      sport: sportKey,
    })

    return { user, club }
  })

  await setUserSession(event, { user: toSessionUser(result.user) })
  await touchLastLogin(result.user.id)

  await notifyAdminClubApplication({
    clubName: clubNameFa!,
    city,
    contactName: name,
    contactPhone: phone,
    contactEmail: result.user.email,
    sportSlug: sportKey === 'tennis' ? 'tennis' : 'padel',
    clubId: result.club.id,
  })

  const redirectTo = '/owner/pending'

  return {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    role: result.user.role,
    secondaryRole: result.user.secondaryRole,
    locale: result.user.locale,
    clubId: result.club.id,
    clubStatus: 'PENDING' as const,
    setupHandoff,
    redirectTo,
  }
})
