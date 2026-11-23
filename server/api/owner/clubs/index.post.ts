import { hasRole } from '#shared/roles.ts'
import { ownerHasActiveClub } from '#shared/ownerClubSelection.ts'
import { notifyAdminClubApplication } from '../../../utils/adminNotify'
import { requireUser } from '../../../utils/auth'
import { resolveUserDisplayName } from '../../../utils/userNameRecord'
import { createOwnerClubForUser } from '../../../utils/ownerClubCreate'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!hasRole(user, 'CLUB_ADMIN')) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const ownerMembership = await prisma.staffMembership.findFirst({
    where: { userId: user.id, active: true, role: 'OWNER' },
    select: { id: true },
  })
  if (!ownerMembership) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody<{
    clubNameFa?: string
    clubNameEn?: string
    city?: string
    addressFa?: string
    addressEn?: string
    sport?: string
    courtCount?: number | string
    clubImage?: string
    galleryUrls?: string[]
    credentialUrls?: string[]
    switchToNew?: boolean
  }>(event)

  const clubNameFa = body.clubNameFa?.trim() || body.clubNameEn?.trim()
  if (!clubNameFa) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, nameFamily: true, nameEn: true, phone: true },
  })
  if (!dbUser) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const contactName = resolveUserDisplayName(dbUser)
  const city = body.city?.trim() || 'تهران'

  const result = await prisma.$transaction((tx) =>
    createOwnerClubForUser(tx, user.id, {
      clubNameFa,
      clubNameEn: body.clubNameEn,
      city,
      addressFa: body.addressFa,
      addressEn: body.addressEn,
      sport: body.sport,
      courtCount: body.courtCount,
      clubImage: body.clubImage,
      galleryUrls: body.galleryUrls,
      credentialUrls: body.credentialUrls,
      contactName,
      contactEmail: dbUser.email,
      contactPhone: dbUser.phone,
    }),
  )

  await notifyAdminClubApplication({
    clubName: clubNameFa,
    city,
    contactName,
    contactPhone: dbUser.phone,
    contactEmail: dbUser.email,
    sportSlug: result.sportKey === 'tennis' ? 'tennis' : 'padel',
    clubId: result.club.id,
  })

  const memberships = await prisma.staffMembership.findMany({
    where: { userId: user.id, active: true },
    include: { club: { select: { status: true } } },
  })
  const hasActive = ownerHasActiveClub(
    memberships.map((m) => ({ club: m.club, isPrimary: m.isPrimary })),
  )
  const shouldSwitch = body.switchToNew !== false && !hasActive

  if (shouldSwitch || body.switchToNew === true) {
    setCookie(event, 'owner_club_id', result.club.id, { path: '/', sameSite: 'lax' })
  }

  return {
    club: {
      id: result.club.id,
      slug: result.club.slug,
      nameFa: result.club.nameFa,
      nameEn: result.club.nameEn,
      status: result.club.status,
    },
    setupHandoff: result.setupHandoff,
    switched: shouldSwitch || body.switchToNew === true,
  }
})