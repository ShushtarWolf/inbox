/**
 * Apex host preference: www.<apex> → https://<apex> (301).
 *
 * Primary fix for production is Liara domain-level redirect (www → inboxs.ir).
 * This middleware is a belt-and-suspenders for requests that still reach the app
 * with Host: www.* when NUXT_PUBLIC_SITE_URL is the apex.
 */
export default defineEventHandler((event) => {
  const site = (process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  if (!site.startsWith('http')) return

  let apexHost = ''
  try {
    apexHost = new URL(site).hostname.toLowerCase()
  } catch {
    return
  }
  if (!apexHost || apexHost.startsWith('www.')) return

  const requestHost = (getRequestHeader(event, 'host') || '').split(':')[0]?.toLowerCase()
  if (requestHost !== `www.${apexHost}`) return

  const url = getRequestURL(event)
  return sendRedirect(event, `${site}${url.pathname}${url.search}`, 301)
})
