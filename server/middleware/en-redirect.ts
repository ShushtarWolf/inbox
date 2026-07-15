/**
 * Soft-disable bilingual EN routes for FA-only launch.
 * `/en` and `/en/...` → equivalent unprefixed FA paths (301).
 */
export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (path !== '/en' && !path.startsWith('/en/')) return

  const target = path === '/en' ? '/' : (path.slice(3) || '/')
  const url = getRequestURL(event)
  const search = url.search || ''
  return sendRedirect(event, `${target}${search}`, 301)
})
