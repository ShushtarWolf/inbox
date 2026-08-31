export type NavItem = {
  to: string
  label: string
  icon?: string
  badge?: number
  /** When set, bottom/side nav runs this instead of navigating (e.g. open auth popup). */
  action?: () => void
}

/** True when this nav item should show as active for the current path. */
export function isNavItemActive(path: string, to: string, items: NavItem[]): boolean {
  const toPath = to.split('?')[0] ?? to
  const hasChildNav = items.some((item) => {
    const itemPath = item.to.split('?')[0] ?? item.to
    return itemPath !== toPath && itemPath.startsWith(`${toPath}/`)
  })
  if (hasChildNav) return path === toPath
  return path === toPath || path.startsWith(`${toPath}/`)
}
