import { slugify } from '../utils/slug'

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

function coachPublicPath(coach: { id: string; nameEn: string }) {
  const slug = slugify(coach.nameEn)
  // Prefer slug URLs that match the public catalog links; fall back to id if slugify is empty/default.
  if (slug && slug !== 'club') return `/coaches/${slug}`
  return `/coaches/${coach.id}`
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')

  const pilotNoCoach = isCoachProductDisabled(event)

  // Indexable discovery + legal shells only. Thin booking chrome (/book/*) stays off the sitemap.
  const staticPaths: Array<{ path: string; changefreq?: string; priority?: string }> = [
    { path: '/', priority: '1.0' },
    { path: '/clubs', priority: '0.9' },
    ...(pilotNoCoach ? [] : [{ path: '/coaches', priority: '0.9' }]),
    { path: '/about', priority: '0.5', changefreq: 'monthly' },
    { path: '/contact', priority: '0.5', changefreq: 'monthly' },
    { path: '/pricing', priority: '0.5', changefreq: 'monthly' },
    { path: '/complaints', priority: '0.3', changefreq: 'yearly' },
    { path: '/cancellation', priority: '0.3', changefreq: 'yearly' },
    { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
    { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  ]

  const clubs = await prisma.club.findMany({
    where: { status: 'ACTIVE' },
    select: { slug: true },
    orderBy: { slug: 'asc' },
  })

  const coaches = pilotNoCoach
    ? []
    : await prisma.coach.findMany({
        where: { isBookable: true, approvalStatus: 'APPROVED' },
        select: { id: true, nameEn: true },
        orderBy: { nameEn: 'asc' },
      })

  const urls = [
    ...staticPaths.map(({ path, changefreq, priority }) => urlEntry(path, changefreq, priority)),
    ...clubs.map((club) => urlEntry(`/clubs/${club.slug}`, 'weekly', '0.8')),
    ...coaches.map((coach) => urlEntry(coachPublicPath(coach), 'weekly', '0.7')),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`
})
