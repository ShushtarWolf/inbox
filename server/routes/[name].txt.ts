/**
 * Enamad domain verification via empty/public txt file.
 * Set NUXT_PUBLIC_ENAMAD_VERIFY_FILE=1234567.txt (exact name from Enamad panel).
 * Then https://inboxs.ir/1234567.txt returns 200 text/plain.
 */
export default defineEventHandler((event) => {
  const expectedRaw = String(process.env.NUXT_PUBLIC_ENAMAD_VERIFY_FILE || '').trim()
  if (!expectedRaw) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const expected = expectedRaw.replace(/^\//, '')
  const name = getRouterParam(event, 'name') || ''
  const requested = name.endsWith('.txt') ? name : `${name}.txt`

  if (requested !== expected && name !== expected.replace(/\.txt$/i, '')) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  return ''
})
