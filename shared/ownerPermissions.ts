export type OwnerPermission = 'calendar' | 'finance' | 'crm' | 'team' | 'settings'

export const ALL_OWNER_PERMISSIONS: OwnerPermission[] = ['calendar', 'finance', 'crm', 'team', 'settings']

export const OWNER_NAV_PERMISSIONS: Record<string, OwnerPermission> = {
  '/owner': 'calendar',
  '/owner/finance': 'finance',
  '/owner/equipments': 'calendar',
  '/owner/packages': 'calendar',
  '/owner/crm': 'crm',
  '/owner/coaches': 'team',
  '/owner/support': 'settings',
  '/owner/settings': 'settings',
}

export function parsePermissions(permissionsJson: string | null | undefined): string[] {
  if (!permissionsJson) return []
  try {
    const parsed = JSON.parse(permissionsJson)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

export function hasOwnerPermission(permissions: string[], permission: OwnerPermission): boolean {
  return permissions.includes(permission)
}

export function isOwnerPermission(value: string): value is OwnerPermission {
  return ALL_OWNER_PERMISSIONS.includes(value as OwnerPermission)
}

export function normalizePermissions(permissions: string[]): OwnerPermission[] {
  return [...new Set(permissions.filter(isOwnerPermission))]
}

export function defaultPermissionsForRole(role: string): OwnerPermission[] {
  switch (role) {
    case 'MANAGER':
      return ['calendar', 'finance', 'crm', 'team']
    case 'FRONT_DESK':
      return ['calendar', 'crm']
    case 'COACH':
      return ['calendar']
    case 'ANALYST':
      return ['finance', 'crm']
    default:
      return ['calendar']
  }
}
