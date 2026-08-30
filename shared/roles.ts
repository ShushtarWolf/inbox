export type PlatformRole = 'ATHLETE' | 'COACH' | 'CLUB_ADMIN'

/** Higher index = preferred primary for login redirect / chrome. */
const ROLE_PRIORITY: PlatformRole[] = ['ATHLETE', 'COACH', 'CLUB_ADMIN']

export const MAX_PLATFORM_ROLES = 3

export type RolesUser = {
  role: string
  secondaryRole?: string | null
  tertiaryRole?: string | null
}

/** Persisted role columns after an add/upgrade (primary by priority, then remaining slots). */
export type RoleSlots = {
  role: PlatformRole
  secondaryRole: PlatformRole | null
  tertiaryRole: PlatformRole | null
}

function asPlatformRole(value: string | null | undefined): PlatformRole | null {
  if (!value) return null
  return ROLE_PRIORITY.includes(value as PlatformRole) ? (value as PlatformRole) : null
}

/** Pack distinct roles into primary / secondary / tertiary columns. */
export function packRoleSlots(roles: PlatformRole[]): RoleSlots {
  const unique = ROLE_PRIORITY.filter((r) => roles.includes(r))
  const role = pickPrimaryRole(unique)
  const rest = unique.filter((r) => r !== role)
  return {
    role,
    secondaryRole: rest[0] ?? null,
    tertiaryRole: rest[1] ?? null,
  }
}

export function userRoles(user: RolesUser): PlatformRole[] {
  const roles: PlatformRole[] = []
  const seen = new Set<PlatformRole>()
  for (const raw of [user.role, user.secondaryRole, user.tertiaryRole]) {
    const role = asPlatformRole(raw)
    if (role && !seen.has(role)) {
      seen.add(role)
      roles.push(role)
    }
  }
  return roles
}

export function hasRole(user: RolesUser, role: PlatformRole | string): boolean {
  return userRoles(user).includes(role as PlatformRole)
}

export function canAddRole(user: RolesUser, role: PlatformRole): boolean {
  if (hasRole(user, role)) return false
  return userRoles(user).length < MAX_PLATFORM_ROLES
}

/** Prefer club-owner identity as primary when multiple roles are present. */
export function pickPrimaryRole(roles: PlatformRole[]): PlatformRole {
  let best: PlatformRole = roles[0] || 'ATHLETE'
  for (const role of roles) {
    if (ROLE_PRIORITY.indexOf(role) > ROLE_PRIORITY.indexOf(best)) best = role
  }
  return best
}

/**
 * Assign another platform role on the same account (max 3).
 * Returns null when the role is already held or the slot is full.
 */
export function assignAddedRole(user: RolesUser, newRole: PlatformRole): RoleSlots | null {
  if (!canAddRole(user, newRole)) return null
  return packRoleSlots([...userRoles(user), newRole])
}

/** Staff desk COACH → platform COACH; other staff roles → CLUB_ADMIN. */
export function platformRoleForStaffInvite(staffRole: string): PlatformRole {
  return staffRole === 'COACH' ? 'COACH' : 'CLUB_ADMIN'
}

/**
 * Resolve platform-role upgrade when inviting an existing user onto club staff.
 * - already_has: no User update needed
 * - slot_full: cannot add another role (409 USER_ROLE_SLOT_FULL)
 * - otherwise: role slots to persist
 */
export function resolveInviteRoleUpgrade(
  user: RolesUser,
  target: PlatformRole,
): RoleSlots | 'already_has' | 'slot_full' {
  if (hasRole(user, target)) return 'already_has'
  const assigned = assignAddedRole(user, target)
  if (!assigned) return 'slot_full'
  return assigned
}

/** Cookie remembering last dashboard role choice (server + client). */
export const LAST_PLATFORM_ROLE_COOKIE = 'inbox_last_role'

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && ROLE_PRIORITY.includes(value as PlatformRole)
}
