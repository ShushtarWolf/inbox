import type { H3Event } from 'h3'
import type { Role } from '@prisma/client'
import { resolvePostLoginPath } from '#shared/returnTo.ts'
import { hasOwnerPermission, parsePermissions, type OwnerPermission } from '#shared/ownerPermissions.ts'

export function postLoginRedirectPath(
  user: { role: string; locale?: string | null },
  _locale?: string,
  returnTo?: string,
) {
  // FA-only launch: always resolve to unprefixed Persian paths
  void user.locale
  void _locale
  return resolvePostLoginPath(user.role, 'fa', returnTo)
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

/** Best-effort stamp for ops readiness (e.g. pilot checklist). */
export async function touchLastLogin(userId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    })
  } catch {
    // Do not block login if the column is missing on a stale local DB.
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
  if (dbUser.disabledAt) {
    await clearUserSession(event)
    throw createError({ statusCode: 403, statusMessage: 'Account disabled' })
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

export async function requireOwnerClub(event: H3Event, permission?: OwnerPermission) {
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
  const permissions = parsePermissions(membership.permissionsJson)
  if (permission && membership.role !== 'OWNER' && !hasOwnerPermission(permissions, permission)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return {
    user,
    club: membership.club,
    membership,
    permissions,
    clubs: memberships.map((item) => ({
      id: item.club.id,
      slug: item.club.slug,
      nameFa: item.club.nameFa,
      nameEn: item.club.nameEn,
      role: item.role,
      isPrimary: item.isPrimary,
      permissions: parsePermissions(item.permissionsJson),
    })),
  }
}
