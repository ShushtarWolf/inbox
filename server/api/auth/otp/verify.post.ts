import { ALL_OWNER_PERMISSIONS } from '#shared/ownerPermissions.ts'
import { phoneToSyntheticEmail } from '#shared/phone.ts'
import { assignAddedRole, type PlatformRole } from '#shared/roles.ts'
import { uniqueClubSlug } from '../../../utils/slug'
import { consumePhoneOtp } from '../../../utils/otp'
import {
  findUserForAdditionalRole,
  findUserForPhoneOtp,
  linkOrphanBookingsByPhone,
} from '../../../utils/phoneAuth'
import { enforceOtpVerifyPhoneLimit } from '../../../utils/rateLimit'
import { normalizeIranPhone } from '#shared/phone.ts'
import { toFaDigits } from '#shared/courtBulk.ts'
import {
  normalizeOwnerCourtCount,
  normalizeOwnerSport,
  ownerSetupHandoff,
  sportSlugsForOwner,
} from '../../../utils/ownerOnboarding'
import { createPendingOwnerApplication } from '../../../utils/ownerSignupApplication'
import { notifyAdminClubApplication } from '../../../utils/adminNotify'
import { ownerPostLoginRedirect, toSessionUser } from '../../../utils/auth'
import { seedDefaultEquipment } from '../../../utils/seedDefaultEquipment'
import type { Prisma, User } from '@prisma/client'

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
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(linkPhone ? { phone } : {}),
        phoneVerifiedAt: new Date(),
        lastLoginAt: new Date(),
      },
    })
    await linkOrphanBookingsByPhone(updated.id, phone)
    await setUserSession(event, { user: toSessionUser(updated) })
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      secondaryRole: updated.secondaryRole,
      tertiaryRole: updated.tertiaryRole,
      locale: updated.locale,
      phone,
      redirectTo: await ownerPostLoginRedirect(updated, body.returnTo, event),
    }
  }

  const name = String(consumed.payload.name || '').trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name required' })
  }

  const role = (consumed.role || 'ATHLETE') as PlatformRole
  const email = phoneToSyntheticEmail(consumed.phone)
  const locale = 'fa'
  const existing = await findUserForAdditionalRole(consumed.phone, role)

  if (role === 'CLUB_ADMIN') {
    const clubNameFa = String(consumed.payload.clubNameFa || '').trim()
    const city = String(consumed.payload.city || 'تهران').trim() || 'تهران'
    const addressFa = String(consumed.payload.addressFa || '').trim() || city
    const sportKey = normalizeOwnerSport(String(consumed.payload.sport || ''))
    const courtCount = normalizeOwnerCourtCount(consumed.payload.courtCount as number | string | undefined)
    const credentialUrls = Array.isArray(consumed.payload.credentialUrls)
      ? (consumed.payload.credentialUrls as unknown[]).filter((u): u is string => typeof u === 'string' && Boolean(u.trim()))
      : []
    const setupHandoff = ownerSetupHandoff(sportKey, courtCount)
    if (!clubNameFa) {
      throw createError({ statusCode: 400, statusMessage: 'Club name required' })
    }

    const sportSlugs = sportSlugsForOwner(sportKey)
    const sports = await prisma.sport.findMany({ where: { slug: { in: sportSlugs } } })
    const sportBySlug = Object.fromEntries(sports.map((s) => [s.slug, s]))
    for (const slug of sportSlugs) {
      if (!sportBySlug[slug]) {
        throw createError({ statusCode: 500, statusMessage: `Sport missing: ${slug}` })
      }
    }
    const slug = await uniqueClubSlug(clubNameFa)

    const result = await prisma.$transaction(async (tx) => {
      const user = existing
        ? await applySecondRole(tx, existing, 'CLUB_ADMIN', { name })
        : await tx.user.create({
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
          addressFa,
          addressEn: addressFa,
          city,
          ownerId: user.id,
          status: 'PENDING',
          phone: consumed.phone,
          credentialsJson: credentialUrls.length ? JSON.stringify(credentialUrls) : null,
        },
      })

      for (let index = 0; index < courtCount; index++) {
        const sportSlug = sportSlugs[index % sportSlugs.length]!
        const sport = sportBySlug[sportSlug]!
        await tx.court.create({
          data: {
            nameFa: `زمین ${toFaDigits(index + 1)}`,
            nameEn: `Court ${index + 1}`,
            clubId: club.id,
            sportId: sport.id,
          },
        })
      }

      await seedDefaultEquipment(tx, club.id)

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

      await createPendingOwnerApplication(tx, {
        clubId: club.id,
        clubName: clubNameFa,
        city,
        contactName: name,
        contactEmail: user.email,
        contactPhone: consumed.phone,
        sport: sportKey,
      })

      return { user, club }
    })

    await setUserSession(event, { user: toSessionUser(result.user) })
    await notifyAdminClubApplication({
      clubName: clubNameFa,
      city,
      contactName: name,
      contactPhone: consumed.phone,
      contactEmail: result.user.email,
      sportSlug: sportKey === 'tennis' ? 'tennis' : 'padel',
      clubId: result.club.id,
    })
    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      secondaryRole: result.user.secondaryRole,
      tertiaryRole: result.user.tertiaryRole,
      locale: result.user.locale,
      phone: result.user.phone,
      clubId: result.club.id,
      clubStatus: 'PENDING' as const,
      setupHandoff,
      redirectTo: '/owner/pending',
    }
  }

  if (role === 'COACH') {
    assertCoachProductEnabled(event)
    const sport = await prisma.sport.findFirstOrThrow({ where: { slug: 'padel' } })
    const result = await prisma.$transaction(async (tx) => {
      const user = existing
        ? await applySecondRole(tx, existing, 'COACH', { name })
        : await tx.user.create({
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

      const coachExists = await tx.coach.findUnique({ where: { userId: user.id } })
      if (coachExists) {
        throw createError({ statusCode: 409, statusMessage: 'Coach profile already exists' })
      }

      const coach = await tx.coach.create({
        data: {
          nameFa: name,
          nameEn: name,
          city: 'تهران',
          sportId: sport.id,
          userId: user.id,
          sessionPrice: 400000,
          isBookable: true,
          approvalStatus: 'PENDING',
          appliedAt: new Date(),
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

    await notifyAdminCoachApplication({
      coachName: name,
      city: result.coach.city,
      phone: result.user.phone,
      email: result.user.email,
    })

    await setUserSession(event, { user: toSessionUser(result.user) })
    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      secondaryRole: result.user.secondaryRole,
      tertiaryRole: result.user.tertiaryRole,
      locale: result.user.locale,
      phone: result.user.phone,
      coachId: result.coach.id,
      redirectTo: '/coach/pending',
    }
  }

  if (existing) {
    const user = await prisma.$transaction(async (tx) => applySecondRole(tx, existing, 'ATHLETE', { name }))
    await linkOrphanBookingsByPhone(user.id, user.phone || consumed.phone)
    await setUserSession(event, { user: toSessionUser(user) })
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      secondaryRole: user.secondaryRole,
      tertiaryRole: user.tertiaryRole,
      locale: user.locale,
      phone: user.phone,
      redirectTo: await ownerPostLoginRedirect(user, body.returnTo, event),
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

  await linkOrphanBookingsByPhone(user.id, consumed.phone)
  await setUserSession(event, { user: toSessionUser(user) })
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    secondaryRole: user.secondaryRole,
    tertiaryRole: user.tertiaryRole,
    locale: user.locale,
    phone: user.phone,
    redirectTo: await ownerPostLoginRedirect(user, body.returnTo, event),
  }
})

async function applySecondRole(
  tx: Prisma.TransactionClient,
  existing: User,
  newRole: PlatformRole,
  opts: { name: string },
) {
  const assigned = assignAddedRole(existing, newRole)
  if (!assigned) {
    throw createError({ statusCode: 409, statusMessage: 'Phone already registered' })
  }
  return tx.user.update({
    where: { id: existing.id },
    data: {
      role: assigned.role,
      secondaryRole: assigned.secondaryRole,
      tertiaryRole: assigned.tertiaryRole,
      phoneVerifiedAt: new Date(),
      // Keep the established display name unless empty.
      ...(existing.name?.trim() ? {} : { name: opts.name, nameEn: opts.name }),
    },
  })
}
