export const INVITEABLE_STAFF_ROLES = ['MANAGER', 'ANALYST', 'FRONT_DESK', 'COACH'] as const
export type InviteableStaffRole = (typeof INVITEABLE_STAFF_ROLES)[number]

const validRoles = new Set<string>(INVITEABLE_STAFF_ROLES)

/** Desk roles default to FRONT_DESK so court-MVP owners invite login staff without coaches. */
export function parseInviteStaffRole(raw?: string): InviteableStaffRole {
  if (raw && validRoles.has(raw)) return raw as InviteableStaffRole
  return 'FRONT_DESK'
}
