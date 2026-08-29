import { randomBytes } from 'node:crypto'
import { normalizeIranPhone } from '#shared/phone.ts'
import {
  PILOT_CLUB_ADDRESS_EN,
  PILOT_CLUB_ADDRESS_FA,
  PILOT_CLUB_CITY,
  PILOT_CLUB_DISTRICT,
  PILOT_CLUB_LAT,
  PILOT_CLUB_LNG,
  PILOT_CLUB_NAME_EN,
  PILOT_CLUB_NAME_FA,
  PILOT_CLUB_PHONE,
  PILOT_COURT_COUNT,
  PILOT_COURT_PRICE,
  PILOT_SPORT_SLUG,
} from '#shared/pilotClub.ts'
import { PILOT_COURT_1_COVER, PILOT_COURT_COVERS } from '#shared/behnazClubPhotos.ts'
import { toFaDigits } from '#shared/courtBulk.ts'
import { hashSecret } from '../../utils/password'
import { applyPilotCourtPhotos } from '../../utils/behnazClubPhotos'
import { seedDefaultEquipment } from '../../utils/seedDefaultEquipment'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{
    type?: 'COACH' | 'CLUB_ADMIN'
    email?: string
    name?: string
    clubName?: string
    phone?: string
    locale?: string
  }>(event)

  const type = body.type
  const email = body.email?.trim().toLowerCase()
  const phone = body.phone ? normalizeIranPhone(body.phone) : null
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
  if (phone) {
    const phoneTaken = await prisma.user.findUnique({ where: { phone } })
    if (phoneTaken) {
      throw createError({ statusCode: 409, statusMessage: 'Phone already registered' })
    }
  }

  const tempPassword = randomBytes(12).toString('base64url')
  const defaultCourtPrice = PILOT_COURT_PRICE

  const sport =
    (await prisma.sport.findFirst({ where: { slug: PILOT_SPORT_SLUG } }))
    || (await prisma.sport.findFirst({ where: { slug: 'padel' } }))
  if (!sport) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Sport catalog not seeded (missing tennis/padel)',
    })
  }

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name,
        nameEn: name,
        role: type,
        passwordHash: hashSecret(tempPassword),
        locale: body.locale === 'en' ? 'en' : 'fa',
        ...(phone ? { phone, phoneVerifiedAt: new Date() } : {}),
      },
    })
    if (type === 'COACH') {
      await tx.coach.create({
        data: { nameFa: name, nameEn: name, city: 'تهران', sportId: sport.id, userId: created.id },
      })
      return { user: created, club: null as null | { id: string; slug: string; nameFa: string } }
    }

    const clubName = body.clubName?.trim() || PILOT_CLUB_NAME_FA
    const isPilot = clubName === PILOT_CLUB_NAME_FA || /علم\s*و?\s*صنعت/.test(clubName)
    const slugTaken = isPilot
      ? await tx.club.findUnique({ where: { slug: 'iust-tennis' }, select: { id: true } })
      : null
    const club = await tx.club.create({
      data: {
        slug: isPilot && !slugTaken ? 'iust-tennis' : `club-${created.id.slice(-8)}`,
        nameFa: clubName,
        nameEn: isPilot ? PILOT_CLUB_NAME_EN : clubName,
        addressFa: isPilot ? PILOT_CLUB_ADDRESS_FA : 'تهران',
        addressEn: isPilot ? PILOT_CLUB_ADDRESS_EN : 'Tehran',
        city: PILOT_CLUB_CITY,
        district: isPilot ? PILOT_CLUB_DISTRICT : null,
        ...(isPilot ? { lat: PILOT_CLUB_LAT, lng: PILOT_CLUB_LNG } : {}),
        ownerId: created.id,
        status: 'ACTIVE',
        openHour: 8,
        closeHour: 22,
        priceFrom: defaultCourtPrice,
        image: isPilot ? PILOT_COURT_1_COVER : null,
        featured: isPilot,
        ...(isPilot ? { phone: PILOT_CLUB_PHONE } : phone ? { phone } : {}),
      },
    })
    for (let i = 1; i <= PILOT_COURT_COUNT; i++) {
      await tx.court.create({
        data: {
          nameFa: `زمین ${toFaDigits(i)}`,
          nameEn: `Court ${i}`,
          clubId: club.id,
          sportId: sport.id,
          price: defaultCourtPrice,
          image: isPilot ? PILOT_COURT_COVERS[i as 1 | 2 | 3] : null,
        },
      })
    }
    await seedDefaultEquipment(tx, club.id)
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

  if (result.club) {
    await applyPilotCourtPhotos(prisma, result.club.id)
  }

  return {
    id: result.user.id,
    email: result.user.email,
    phone: result.user.phone,
    role: result.user.role,
    temporaryPassword: tempPassword,
    clubId: result.club?.id ?? null,
    clubSlug: result.club?.slug ?? null,
    clubName: result.club?.nameFa ?? null,
  }
})
