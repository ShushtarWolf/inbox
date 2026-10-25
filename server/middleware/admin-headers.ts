/** Admin console + admin API: never indexed, never cached by shared caches. */
export default defineEventHandler((event) => {
  const path = (event.path || '').split('?')[0] || ''
  if (!/^(\/en)?\/admin(\/|$)/.test(path) && !path.startsWith('/api/admin')) return
  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  setResponseHeader(event, 'Cache-Control', 'no-store')
})
