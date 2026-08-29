import { ALL_OWNER_PERMISSIONS } from '#shared/ownerPermissions.ts'
import { normalizeIranPhone, phoneToSyntheticEmail } from '#shared/phone.ts'
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
  PILOT_CLUB_SLUG,
  PILOT_COURT_COUNT,
  PILOT_COURT_PRICE,
  PILOT_OWNER_NAME,
  PILOT_OWNER_PHONE,
  PILOT_SPORT_SLUG,
} from '#shared/pilotClub.ts'
import { PILOT_COURT_1_COVER, PILOT_COURT_COVERS } from '#shared/behnazClubPhotos.ts'
import { toFaDigits } from '#shared/courtBulk.ts'
import { catalogCounts, wipeCatalog } from '../../utils/wipeCatalog'
import { applyPilotCourtPhotos, ensurePilotCourts } from '../../utils/behnazClubPhotos'
import { seedDefaultEquipment } from '../../utils/seedDefaultEquipment'

const WIPE_CONFIRM = 'WIPE_ALL_USERS_AND_CLUBS'

/**
 * One-shot pilot reset: wipe all users/clubs/data, keep sports,
 * provision a single CLUB_ADMIN with the given phone.
 *
 * POST /api/admin/reset-pilot
 * Header: x-admin-secret
 * Body: { confirm: "WIPE_ALL_USERS_AND_CLUBS", phone?, name?, clubName? }
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)

  const body = await readBody<{
    confirm?: string
    phone?: string
    name?: string
    clubName?: string
  }>(event)

  if (body.confirm !== WIPE_CONFIRM) {
    throw createError({
      statusCode: 400,
      statusMessage: `confirm must be ${WIPE_CONFIRM}`,
    })
  }

  const phone = normalizeIranPhone(body.phone || PILOT_OWNER_PHONE)
  if (!phone) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid phone' })
  }

  const name = body.name?.trim() || PILOT_OWNER_NAME
  const clubName = body.clubName?.trim() || PILOT_CLUB_NAME_FA

  const before = await catalogCounts()
  await wipeCatalog()

  const sport =
    (await prisma.sport.findFirst({ where: { slug: PILOT_SPORT_SLUG } }))
    || (await prisma.sport.findFirst({ where: { slug: 'padel' } }))
  if (!sport) {
    throw createError({ statusCode: 503, statusMessage: 'Sport catalog missing tennis/padel' })
  }

  const slugTaken = await prisma.club.findUnique({ where: { slug: PILOT_CLUB_SLUG } })
  const slug = slugTaken ? `${PILOT_CLUB_SLUG}-${Date.now().toString(36)}` : PILOT_CLUB_SLUG
  const email = phoneToSyntheticEmail(phone)

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name,
        nameEn: name,
        role: 'CLUB_ADMIN',
        locale: 'fa',
        phone,
        phoneVerifiedAt: new Date(),
      },
    })

    const club = await tx.club.create({
      data: {
        slug,
        nameFa: clubName,
        nameEn: clubName === PILOT_CLUB_NAME_FA ? PILOT_CLUB_NAME_EN : clubName,
        addressFa: PILOT_CLUB_ADDRESS_FA,
        addressEn: PILOT_CLUB_ADDRESS_EN,
        city: PILOT_CLUB_CITY,
        district: PILOT_CLUB_DISTRICT,
        lat: PILOT_CLUB_LAT,
        lng: PILOT_CLUB_LNG,
        ownerId: user.id,
        status: 'ACTIVE',
        openHour: 8,
        closeHour: 22,
        priceFrom: PILOT_COURT_PRICE,
        phone: PILOT_CLUB_PHONE,
        image: PILOT_COURT_1_COVER,
        featured: true,
        // Schema default is 4.5 — do not ship a fake demo rating with zero reviews.
        rating: 0,
      },
    })

    for (let i = 1; i <= PILOT_COURT_COUNT; i++) {
      await tx.court.create({
        data: {
          nameFa: `زمین ${toFaDigits(i)}`,
          nameEn: `Court ${i}`,
          clubId: club.id,
          sportId: sport.id,
          price: PILOT_COURT_PRICE,
          image: PILOT_COURT_COVERS[i as 1 | 2 | 3],
        },
      })
    }

    await seedDefaultEquipment(tx, club.id)

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

  await ensurePilotCourts(prisma, created.club.id)
  const media = await applyPilotCourtPhotos(prisma, created.club.id)

  const after = await catalogCounts()
  const leftoverGoogle = await prisma.user.count({
    where: { oauthProvider: { not: null } },
  })
  const leftoverDemo = await prisma.user.count({
    where: {
      email: { endsWith: '@inbox.local' },
      NOT: { email: { endsWith: '@users.inbox.local' } },
    },
  })

  return {
    ok: true,
    before,
    after,
    leftoverGoogle,
    leftoverDemo,
    seedDemoData: false,
    owner: {
      id: created.user.id,
      phone: created.user.phone,
      email: created.user.email,
      name: created.user.name,
    },
    club: {
      id: created.club.id,
      slug: created.club.slug,
      nameFa: created.club.nameFa,
      image: created.club.image,
      openHour: created.club.openHour,
      closeHour: created.club.closeHour,
      courts: PILOT_COURT_COUNT,
      mediaCount: media.mediaAdded.length,
    },
  }
})
