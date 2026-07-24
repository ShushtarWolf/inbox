import { ALL_OWNER_PERMISSIONS } from '#shared/ownerPermissions.ts'
import { normalizeIranPhone, phoneToSyntheticEmail } from '#shared/phone.ts'
import { uniqueClubSlug } from '../../utils/slug'
import { catalogCounts, wipeCatalog } from '../../utils/wipeCatalog'

const WIPE_CONFIRM = 'WIPE_ALL_USERS_AND_CLUBS'
const DEFAULT_OWNER_PHONE = '09124777927'
const DEFAULT_OWNER_NAME = 'بهناز'
const DEFAULT_CLUB_NAME = 'باشگاه بهناز'
const DEFAULT_COURT_PRICE = 600_000

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

  const phone = normalizeIranPhone(body.phone || DEFAULT_OWNER_PHONE)
  if (!phone) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid phone' })
  }

  const name = body.name?.trim() || DEFAULT_OWNER_NAME
  const clubName = body.clubName?.trim() || DEFAULT_CLUB_NAME

  const before = await catalogCounts()
  await wipeCatalog()

  const padel = await prisma.sport.findFirst({ where: { slug: 'padel' } })
  if (!padel) {
    throw createError({ statusCode: 503, statusMessage: 'Sport catalog missing padel' })
  }

  const slug = await uniqueClubSlug(clubName)
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
        nameEn: clubName,
        addressFa: 'تهران',
        addressEn: 'Tehran',
        city: 'تهران',
        ownerId: user.id,
        status: 'ACTIVE',
        openHour: 8,
        closeHour: 22,
        priceFrom: DEFAULT_COURT_PRICE,
        phone,
      },
    })

    for (let i = 1; i <= 2; i++) {
      await tx.court.create({
        data: {
          nameFa: `زمین ${i}`,
          nameEn: `Court ${i}`,
          clubId: club.id,
          sportId: padel.id,
          price: DEFAULT_COURT_PRICE,
        },
      })
    }

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

  const after = await catalogCounts()

  return {
    ok: true,
    before,
    after,
    owner: {
      id: created.user.id,
      phone: created.user.phone,
      email: created.user.email,
      role: created.user.role,
      name: created.user.name,
    },
    club: {
      id: created.club.id,
      slug: created.club.slug,
      nameFa: created.club.nameFa,
    },
  }
})
