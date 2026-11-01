import { hasOwnerPermission, parsePermissions } from './ownerPermissions.ts'

export type OwnerDeskMembership = {
  role: string
  permissionsJson?: string | null
  active?: boolean
}

/** Active club staff who may use owner desk (calendar / reserve), regardless of platform role column. */
export function staffCanAccessOwnerDesk(
  memberships: OwnerDeskMembership[] | null | undefined,
): boolean {
  if (!memberships?.length) return false
  for (const membership of memberships) {
    if (membership.active === false) continue
    if (membership.role === 'OWNER') return true
    const permissions = parsePermissions(membership.permissionsJson)
    if (hasOwnerPermission(permissions, 'calendar')) return true
  }
  return false
}
