import type { H3Event } from 'h3'
import type { Role } from '@prisma/client'
import { resolvePostLoginPath } from '#shared/returnTo.ts'

export function postLoginRedirectPath(
  user: { role: string; locale?: string | null },
  locale?: string,
  returnTo?: string,
) {
  const resolvedLocale = locale === 'en' || user.locale === 'en' ? 'en' : 'fa'
  return resolvePostLoginPath(user.role, resolvedLocale, returnTo)
}

export function toSessionUser(user: {
  id: string
  email: string
  name: string
  nameEn?: string | null
  role: string
  locale: string
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    nameEn: user.nameEn,
    role: user.role,
    locale: user.locale,
  }
}

export async function requireUser(event: H3Event) {
  const session = await getUserSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!dbUser) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Session expired' })
  }
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as Role,
    locale: dbUser.locale,
    phone: dbUser.phone,
  }
}

export async function requireRole(event: H3Event, ...roles: Role[]) {
  const user = await requireUser(event)
  if (!roles.includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}

export async function requireOwnerClub(event: H3Event) {
  const user = await requireRole(event, 'CLUB_ADMIN')
  const memberships = await prisma.staffMembership.findMany({
    where: { userId: user.id, active: true, role: { in: ['OWNER', 'MANAGER', 'ANALYST', 'FRONT_DESK'] } },
    include: { club: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })
  if (!memberships.length) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }
  const selectedClubId = getCookie(event, 'owner_club_id')
  const membership = memberships.find((item) => item.clubId === selectedClubId) || memberships[0]!
  if (!selectedClubId || selectedClubId !== membership.clubId) {
    setCookie(event, 'owner_club_id', membership.clubId, { path: '/', sameSite: 'lax' })
  }
  return {
    user,
    club: membership.club,
    membership,
    clubs: memberships.map((item) => ({
      id: item.club.id,
      slug: item.club.slug,
      nameFa: item.club.nameFa,
      nameEn: item.club.nameEn,
      role: item.role,
      isPrimary: item.isPrimary,
    })),
  }
}
