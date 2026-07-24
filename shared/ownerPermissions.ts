export const FINANCE_SUB_PERMISSIONS = [
  'finance:view',
  'finance:transactions',
  'finance:reports',
  'finance:payouts',
] as const

export type FinanceSubPermission = (typeof FINANCE_SUB_PERMISSIONS)[number]

export type OwnerPermission =
  | 'calendar'
  | 'crm'
  | 'team'
  | 'settings'
  | 'finance'
  | FinanceSubPermission

export const ALL_OWNER_PERMISSIONS: OwnerPermission[] = [
  'calendar',
  'finance:view',
  'finance:transactions',
  'finance:reports',
  'finance:payouts',
  'crm',
  'team',
  'settings',
]

export const OWNER_NAV_PERMISSIONS: Record<string, OwnerPermission | 'finance'> = {
  '/owner': 'calendar',
  '/owner/calendar': 'calendar',
  '/owner/finance': 'finance',
  '/owner/equipments': 'calendar',
  '/owner/packages': 'calendar',
  '/owner/crm': 'crm',
  '/owner/coaches': 'team',
  '/owner/workers': 'settings',
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

export function hasLegacyFinance(permissions: string[]): boolean {
  return permissions.includes('finance')
}

export function hasOwnerPermission(permissions: string[], permission: string): boolean {
  if (hasLegacyFinance(permissions) && (permission === 'finance' || permission.startsWith('finance:'))) {
    return true
  }
  if (permission === 'finance') {
    return FINANCE_SUB_PERMISSIONS.some((item) => permissions.includes(item))
  }
  return permissions.includes(permission)
}

export function canAccessOwnerNav(path: string, permissions: string[], isOwner = false): boolean {
  if (isOwner) return true
  const perm = OWNER_NAV_PERMISSIONS[path]
  if (!perm) return true
  return hasOwnerPermission(permissions, perm)
}

export function isOwnerPermission(value: string): value is OwnerPermission {
  return ALL_OWNER_PERMISSIONS.includes(value as OwnerPermission) || value === 'finance'
}

export function normalizePermissions(permissions: string[]): OwnerPermission[] {
  return [...new Set(permissions.filter(isOwnerPermission))]
}

export function defaultPermissionsForRole(role: string): OwnerPermission[] {
  switch (role) {
    case 'MANAGER':
      return ['calendar', 'finance:view', 'finance:transactions', 'finance:reports', 'finance:payouts', 'crm', 'team']
    case 'FRONT_DESK':
      return ['calendar', 'crm']
    case 'COACH':
      return ['calendar']
    case 'ANALYST':
      return ['finance:view', 'finance:transactions', 'finance:reports', 'crm']
    default:
      return ['calendar']
  }
}

export const BASE_OWNER_PERMISSIONS = ALL_OWNER_PERMISSIONS.filter(
  (permission) => !permission.startsWith('finance:'),
)
