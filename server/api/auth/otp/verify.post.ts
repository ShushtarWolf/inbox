import { ALL_OWNER_PERMISSIONS } from '#shared/ownerPermissions.ts'
import { phoneToSyntheticEmail } from '#shared/phone.ts'
import { uniqueClubSlug } from '../../../utils/slug'
import { consumePhoneOtp } from '../../../utils/otp'
import { findUserForPhoneOtp } from '../../../utils/phoneAuth'
import { enforceOtpVerifyPhoneLimit } from '../../../utils/rateLimit'
import { normalizeIranPhone } from '#shared/phone.ts'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:otp-verify')
  const body = await readBody<{
    phone?: string
    code?: string
    purpose?: 'login' | 'register'
    returnTo?: string
  }>(event)

  const normalizedPhone = normalizeIranPhone(body.phone || '')
  if (normalizedPhone) {
    await enforceOtpVerifyPhoneLimit(normalizedPhone)
  }

  const purpose = body.purpose === 'login' ? 'login' : 'register'
  const consumed = await consumePhoneOtp({
    phoneRaw: body.phone || '',
    code: body.code || '',
    purpose,
  })

  if (purpose === 'login') {
    const match = await findUserForPhoneOtp(consumed.phone)
    if (!match) {
      throw createError({ statusCode: 404, statusMessage: 'Phone not registered' })
    }
    const { user, linkPhone, phone } = match
    if (user.disabledAt) {
      throw createError({ statusCode: 403, statusMessage: 'Account disabled' })
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(linkPhone ? { phone } : {}),
        phoneVerifiedAt: new Date(),
        lastLoginAt: new Date(),
      },
    })
    await setUserSession(event, { user: toSessionUser(user) })
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      locale: user.locale,
      phone,
      redirectTo: postLoginRedirectPath(user, user.locale, body.returnTo),
    }
  }

  const name = String(consumed.payload.name || '').trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name required' })
  }

  const role = consumed.role || 'ATHLETE'
  const email = phoneToSyntheticEmail(consumed.phone)
  const locale = 'fa'

  if (role === 'CLUB_ADMIN') {
    const clubNameFa = String(consumed.payload.clubNameFa || '').trim()
    const city = String(consumed.payload.city || 'تهران').trim() || 'تهران'
    if (!clubNameFa) {
      throw createError({ statusCode: 400, statusMessage: 'Club name required' })
    }

    const sport = await prisma.sport.findFirstOrThrow({ where: { slug: 'padel' } })
    const slug = await uniqueClubSlug(clubNameFa)

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          nameEn: name,
          email,
          role: 'CLUB_ADMIN',
          locale,
          phone: consumed.phone,
          phoneVerifiedAt: new Date(),
        },
      })

      const club = await tx.club.create({
        data: {
          slug,
          nameFa: clubNameFa,
          nameEn: clubNameFa,
          addressFa: city,
          addressEn: city,
          city,
          ownerId: user.id,
          status: 'ACTIVE',
          phone: consumed.phone,
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

      return { user, club }
    })

    await setUserSession(event, { user: toSessionUser(result.user) })
    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      locale: result.user.locale,
      phone: result.user.phone,
      clubId: result.club.id,
      redirectTo: postLoginRedirectPath(result.user, locale, body.returnTo),
    }
  }

  if (role === 'COACH') {
    assertCoachProductEnabled(event)
    const sport = await prisma.sport.findFirstOrThrow({ where: { slug: 'padel' } })
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          nameEn: name,
          email,
          role: 'COACH',
          locale,
          phone: consumed.phone,
          phoneVerifiedAt: new Date(),
        },
      })

      const coach = await tx.coach.create({
        data: {
          nameFa: name,
          nameEn: name,
          city: 'تهران',
          sportId: sport.id,
          userId: user.id,
          sessionPrice: 400000,
          isBookable: true,
        },
      })

      await tx.coachAvailability.createMany({
        data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
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
      phone: result.user.phone,
      coachId: result.coach.id,
      redirectTo: postLoginRedirectPath(result.user, locale, body.returnTo),
    }
  }

  const user = await prisma.user.create({
    data: {
      name,
      nameEn: name,
      email,
      role: 'ATHLETE',
      locale,
      phone: consumed.phone,
      phoneVerifiedAt: new Date(),
    },
  })

  await setUserSession(event, { user: toSessionUser(user) })
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locale: user.locale,
    phone: user.phone,
    redirectTo: postLoginRedirectPath(user, locale, body.returnTo),
  }
})
