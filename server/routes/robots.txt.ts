export default defineEventHandler((event) => {
  const site = (process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '') || getRequestURL(event).origin
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return `User-agent: *
Allow: /

Sitemap: ${site}/sitemap.xml
`
})
