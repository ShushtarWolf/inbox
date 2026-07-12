function siteUrl() {
  return (process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
}

function urlEntry(loc: string, changefreq = 'weekly', priority = '0.8') {
  return `  <url>
    <loc>${siteUrl()}${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')

  const staticPaths = [
    '/',
    '/clubs',
    '/coaches',
    '/login',
    '/register',
    '/privacy',
    '/terms',
    '/en',
    '/en/clubs',
    '/en/coaches',
    '/en/login',
    '/en/privacy',
  ]

  const [clubs, coaches] = await Promise.all([
    prisma.club.findMany({
      where: { status: 'ACTIVE' },
      select: { slug: true },
      take: 500,
    }),
    prisma.coach.findMany({
      where: { isBookable: true },
      select: { id: true },
      take: 500,
    }),
  ])

  const urls = [
    ...staticPaths.map((path) => urlEntry(path)),
    ...clubs.flatMap((club) => [
      urlEntry(`/clubs/${club.slug}`),
      urlEntry(`/en/clubs/${club.slug}`),
      urlEntry(`/book/court/${club.slug}`, 'weekly', '0.7'),
    ]),
    ...coaches.flatMap((coach) => [
      urlEntry(`/coaches/${coach.id}`),
      urlEntry(`/en/coaches/${coach.id}`),
      urlEntry(`/book/coach/${coach.id}`, 'weekly', '0.7'),
    ]),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`
})
