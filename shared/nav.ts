export type NavItem = { to: string; label: string; icon?: string; badge?: number }

/** True when this nav item should show as active for the current path. */
export function isNavItemActive(path: string, to: string, items: NavItem[]): boolean {
  const hasChildNav = items.some((item) => item.to !== to && item.to.startsWith(`${to}/`))
  if (hasChildNav) return path === to
  return path === to || path.startsWith(`${to}/`)
}
