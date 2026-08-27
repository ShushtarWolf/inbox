export type PlatformRole = 'ATHLETE' | 'COACH' | 'CLUB_ADMIN'

/** Higher index = preferred primary for login redirect / chrome. */
const ROLE_PRIORITY: PlatformRole[] = ['ATHLETE', 'COACH', 'CLUB_ADMIN']

export function userRoles(user: {
  role: string
  secondaryRole?: string | null
}): PlatformRole[] {
  const roles: PlatformRole[] = []
  const primary = user.role as PlatformRole
  if (ROLE_PRIORITY.includes(primary)) roles.push(primary)
  const secondary = user.secondaryRole as PlatformRole | null | undefined
  if (secondary && ROLE_PRIORITY.includes(secondary) && secondary !== primary) {
    roles.push(secondary)
  }
  return roles
}

export function hasRole(
  user: { role: string; secondaryRole?: string | null },
  role: PlatformRole | string,
): boolean {
  return userRoles(user).includes(role as PlatformRole)
}

export function canAddRole(
  user: { role: string; secondaryRole?: string | null },
  role: PlatformRole,
): boolean {
  if (hasRole(user, role)) return false
  return userRoles(user).length < 2
}

/** Prefer club-owner identity as primary when both roles are present. */
export function pickPrimaryRole(roles: PlatformRole[]): PlatformRole {
  let best: PlatformRole = roles[0] || 'ATHLETE'
  for (const role of roles) {
    if (ROLE_PRIORITY.indexOf(role) > ROLE_PRIORITY.indexOf(best)) best = role
  }
  return best
}

/**
 * Assign a second platform role on the same account (max 2).
 * Returns null when the role is already held or the slot is full.
 */
export function assignAddedRole(
  user: { role: string; secondaryRole?: string | null },
  newRole: PlatformRole,
): { role: PlatformRole; secondaryRole: PlatformRole } | null {
  if (!canAddRole(user, newRole)) return null
  const combined = [...userRoles(user), newRole] as PlatformRole[]
  const role = pickPrimaryRole(combined)
  const secondaryRole = combined.find((r) => r !== role)!
  return { role, secondaryRole }
}

/** Staff desk COACH → platform COACH; other staff roles → CLUB_ADMIN. */
export function platformRoleForStaffInvite(staffRole: string): PlatformRole {
  return staffRole === 'COACH' ? 'COACH' : 'CLUB_ADMIN'
}

/**
 * Resolve platform-role upgrade when inviting an existing user onto club staff.
 * - already_has: no User update needed
 * - slot_full: cannot add a third role (409 USER_ROLE_SLOT_FULL)
 * - otherwise: new role + secondaryRole to persist
 */
export function resolveInviteRoleUpgrade(
  user: { role: string; secondaryRole?: string | null },
  target: PlatformRole,
): { role: PlatformRole; secondaryRole: PlatformRole } | 'already_has' | 'slot_full' {
  if (hasRole(user, target)) return 'already_has'
  const assigned = assignAddedRole(user, target)
  if (!assigned) return 'slot_full'
  return assigned
}
