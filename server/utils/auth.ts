import type { H3Event } from 'h3'
import type { Role, User } from '@prisma/client'
import { resolvePostLoginPath, roleDashboardPath, sanitizeReturnTo } from '#shared/returnTo.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import {
  hasRole,
  isPlatformRole,
  LAST_PLATFORM_ROLE_COOKIE,
  userRoles,
  type PlatformRole,
  type RolesUser,
} from '#shared/roles.ts'
import { hasOwnerPermission, parsePermissions, type OwnerPermission } from '#shared/ownerPermissions.ts'

export async function findUserForPasswordLogin(identifier: string) {
  const trimmed = identifier.trim()
  const phone = normalizeIranPhone(trimmed)
  if (phone) {
    return prisma.user.findUnique({
      where: { phone },
      include: { coachProfile: { select: { photo: true } } },
    })
  }
  return prisma.user.findUnique({
    where: { email: trimmed.toLowerCase() },
    include: { coachProfile: { select: { photo: true } } },
  })
}

export type PasswordLoginUser = User & { coachProfile: { photo: string | null } | null }

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

/** Dashboard path for a held role, with coach/owner admin-acceptance gates. */
export async function pathForPlatformRole(
  user: { id: string } & RolesUser,
  role: PlatformRole,
): Promise<string> {
  if (role === 'CLUB_ADMIN') {
    const membership = await prisma.staffMembership.findFirst({
      where: { userId: user.id, active: true },
      include: { club: { select: { status: true } } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    })
    const status = membership?.club.status
    if (status === 'PENDING' || status === 'SUSPENDED') {
      return '/owner/pending'
    }
    return roleDashboardPath('CLUB_ADMIN')
  }
  if (role === 'COACH') {
    const coach = await prisma.coach.findFirst({
      where: { userId: user.id },
      select: { approvalStatus: true },
    })
    if (coach && coach.approvalStatus !== 'APPROVED') {
      return '/coach/pending'
    }
    return roleDashboardPath('COACH')
  }
  return roleDashboardPath('ATHLETE')
}

/**
 * Post-login redirect:
 * - sanitized returnTo wins (except bare /owner hub → pending gate)
 * - 2+ roles → last chosen cookie if still held, else /choose-role
 * - 1 role → that dashboard (with pending gates)
 */
export async function ownerPostLoginRedirect(
  user: { id: string; locale?: string | null } & RolesUser,
  returnTo?: string,
  event?: H3Event,
) {
  const clean = returnTo ? sanitizeReturnTo(returnTo) : null
  if (clean) {
    // Explicit deep-link wins (e.g. /owner/setup) unless it is the generic /owner hub.
    if (clean !== '/owner' && clean !== '/owner/') {
      return resolvePostLoginPath(user.role, 'fa', clean)
    }
    if (hasRole(user, 'CLUB_ADMIN')) {
      return pathForPlatformRole(user, 'CLUB_ADMIN')
    }
    return resolvePostLoginPath(user.role, 'fa', clean)
  }

  const roles = userRoles(user)
  if (roles.length >= 2 && event) {
    const last = getCookie(event, LAST_PLATFORM_ROLE_COOKIE)
    if (isPlatformRole(last) && hasRole(user, last)) {
      return pathForPlatformRole(user, last)
    }
    return '/choose-role'
  }
  if (roles.length >= 2) {
    // No request cookie available (tests / callers without event) — keep primary dashboard.
    return pathForPlatformRole(user, roles.includes('CLUB_ADMIN')
      ? 'CLUB_ADMIN'
      : roles.includes('COACH') ? 'COACH' : 'ATHLETE')
  }

  const only = (roles[0] || 'ATHLETE') as PlatformRole
  return pathForPlatformRole(user, only)
}

export function toSessionUser(user: {
  id: string
  email: string
  name: string
  nameEn?: string | null
  role: string
  secondaryRole?: string | null
  tertiaryRole?: string | null
  locale: string
  avatarUrl?: string | null
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    nameEn: user.nameEn,
    role: user.role,
    secondaryRole: user.secondaryRole || null,
    tertiaryRole: user.tertiaryRole || null,
    locale: user.locale,
    avatarUrl: user.avatarUrl || null,
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
    secondaryRole: (dbUser.secondaryRole as Role | null) || null,
    tertiaryRole: (dbUser.tertiaryRole as Role | null) || null,
    locale: dbUser.locale,
    phone: dbUser.phone,
  }
}

export async function requireRole(event: H3Event, ...roles: Role[]) {
  const user = await requireUser(event)
  if (!roles.some((role) => hasRole(user, role))) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}

/** Desk/CRM/finance need an ACTIVE club; settings/setup remain available while PENDING/SUSPENDED. */
export function permissionNeedsActiveClub(permission?: OwnerPermission | string) {
  if (!permission) return false
  if (permission === 'settings') return false
  return true
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
  // PENDING/SUSPENDED clubs may finish setup (settings) but not run desk/finance/CRM ops.
  const status = membership.club.status
  if (status && status !== 'ACTIVE' && permissionNeedsActiveClub(permission)) {
    throw createError({ statusCode: 403, statusMessage: 'CLUB_NOT_ACTIVE' })
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
