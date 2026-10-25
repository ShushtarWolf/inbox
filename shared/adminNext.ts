/** Admin deep-link helpers (route guard + gate return). */
export function adminNextTarget(path: string): string | null {
  const p = path.replace(/^\/en(?=\/|$)/, '') || '/'
  if (!/^\/admin\/.+/.test(p)) return null
  return p
}

export function sanitizeAdminNext(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!/^\/admin\/[A-Za-z0-9/_\-?=&%.]*$/.test(value) || value.includes('//')) return null
  return value
}
