import { assignAddedRole, canAddRole } from '#shared/roles.ts'
import { parseGender } from '#shared/gender.ts'
import { toSessionUser, touchLastLogin } from '../../utils/auth'

/**
 * Coach password registration. Existing phone/email users get COACH as an added
 * platform role (up to 3) instead of a second account. Public listing stays PENDING
 * until admin approval.
 */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  await enforceRateLimit(event, 'auth:register-coach')
  const body = await readBody<{
    name?: string
    email?: string
    phone?: string
    password?: string
    locale?: string
    gender?: string
    clubId?: string
    bioFa?: string
    bioEn?: string
    sessionPrice?: number
    avatarUrl?: string
    credentialUrls?: string[]
    returnTo?: string
  }>(event)

  const name = body.name?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ''
  const clubId = body.clubId?.trim() || ''
  const phone = body.phone?.trim() || undefined
  const gender = parseGender(body.gender)

  if (!name || !email || password.length < 6 || !gender) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  rejectDemoEmailInProduction(email)

  const club = clubId
    ? await prisma.club.findFirst({ where: { id: clubId, status: 'ACTIVE' } })
    : null
  if (clubId && !club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  const existingByEmail = await prisma.user.findUnique({ where: { email } })
  const existingByPhone = phone
    ? await prisma.user.findUnique({ where: { phone } })
    : null
  if (existingByEmail && existingByPhone && existingByEmail.id !== existingByPhone.id) {
    throw createError({ statusCode: 409, statusMessage: 'Email and phone belong to different accounts' })
  }
  const existingUser = existingByEmail || existingByPhone
  if (existingUser && !canAddRole(existingUser, 'COACH')) {
    throw createError({
      statusCode: 409,
      statusMessage: existingByEmail ? 'Email already registered' : 'Phone already registered',
    })
  }
  if (existingUser) {
    const coachExists = await prisma.coach.findUnique({ where: { userId: existingUser.id } })
    if (coachExists) {
      throw createError({ statusCode: 409, statusMessage: 'Coach profile already exists' })
    }
  }

  const court = club
    ? await prisma.court.findFirst({ where: { clubId: club.id }, include: { sport: true } })
    : null
  const sport = court?.sport || await prisma.sport.findFirstOrThrow({ where: { slug: 'padel' } })
  const locale = body.locale === 'en' ? 'en' : 'fa'
  const sessionPrice = body.sessionPrice !== undefined ? Math.max(0, Math.round(body.sessionPrice)) : 400000

  const result = await prisma.$transaction(async (tx) => {
    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            ...assignAddedRole(existingUser, 'COACH')!,
            passwordHash: hashSecret(password),
            ...(phone && !existingUser.phone ? { phone } : {}),
            ...(!existingUser.gender ? { gender } : {}),
            avatarUrl: body.avatarUrl?.trim() || existingUser.avatarUrl,
          },
        })
      : await tx.user.create({
          data: {
            name,
            nameEn: name,
            email,
            role: 'COACH',
            passwordHash: hashSecret(password),
            locale,
            gender,
            phone: phone || null,
            avatarUrl: body.avatarUrl?.trim() || null,
          },
        })

    const coach = await tx.coach.create({
      data: {
        nameFa: name,
        nameEn: name,
        city: club?.city || 'تهران',
        sportId: sport.id,
        // Coaches are independent — no club affiliation at signup.
        clubId: null,
        userId: user.id,
        bioFa: body.bioFa?.trim() || null,
        bioEn: body.bioEn?.trim() || body.bioFa?.trim() || null,
        sessionPrice,
        photo: body.avatarUrl?.trim() || null,
        credentialsJson: body.credentialUrls?.length ? JSON.stringify(body.credentialUrls) : null,
        isBookable: true,
        approvalStatus: 'PENDING',
        appliedAt: new Date(),
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

  await notifyAdminCoachApplication({
    coachName: name,
    city: result.coach.city,
    phone: phone || null,
    email,
  })

  await setUserSession(event, { user: toSessionUser(result.user) })
  await touchLastLogin(result.user.id)
  return {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    role: result.user.role,
    secondaryRole: result.user.secondaryRole,
    tertiaryRole: result.user.tertiaryRole,
    locale: result.user.locale,
    coachId: result.coach.id,
    redirectTo: '/coach/pending',
  }
})
