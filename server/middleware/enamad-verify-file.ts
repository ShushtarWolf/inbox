/**
 * Enamad domain verification file (exact filename from panel).
 * Set NUXT_PUBLIC_ENAMAD_VERIFY_FILE=1234567.txt → serves https://inboxs.ir/1234567.txt
 *
 * Intentionally middleware (not server/routes/[name].txt.ts): a dynamic :name route
 * was matching real pages like /about and 404ing the whole site.
 */
export default defineEventHandler((event) => {
  const expected = String(process.env.NUXT_PUBLIC_ENAMAD_VERIFY_FILE || '')
    .trim()
    .replace(/^\//, '')
  if (!expected) return

  const pathname = getRequestURL(event).pathname.replace(/^\//, '')
  if (pathname !== expected) return

  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-store')
  return send(event, '')
})
