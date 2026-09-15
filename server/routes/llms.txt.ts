import { buildLlmsTxt } from '#shared/llmsTxt.ts'
import { slugify } from '../utils/slug'

function siteUrl() {
  return (process.env.NUXT_PUBLIC_SITE_URL || 'https://inboxs.ir').replace(/\/$/, '')
}

function coachPublicPath(coach: { id: string; nameEn: string }) {
  const slug = slugify(coach.nameEn)
  if (slug && slug !== 'club') return `/coaches/${slug}`
  return `/coaches/${coach.id}`
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')

  const pilotNoCoach = isCoachProductDisabled(event)

  const clubs = await prisma.club.findMany({
    where: { status: 'ACTIVE' },
    select: {
      slug: true,
      nameFa: true,
      city: true,
      district: true,
      courts: { select: { sport: { select: { nameFa: true } } } },
    },
    orderBy: { slug: 'asc' },
  })

  const coaches = pilotNoCoach
    ? []
    : await prisma.coach.findMany({
        where: { isBookable: true, approvalStatus: 'APPROVED' },
        select: { id: true, nameFa: true, nameEn: true, city: true },
        orderBy: { nameFa: 'asc' },
      })

  return buildLlmsTxt({
    siteUrl: siteUrl(),
    clubs: clubs.map((club) => ({
      slug: club.slug,
      nameFa: club.nameFa,
      city: club.city,
      district: club.district,
      sports: [...new Set(club.courts.map((court) => court.sport.nameFa).filter(Boolean))],
    })),
    coaches: coaches.map((coach) => ({
      path: coachPublicPath(coach),
      nameFa: coach.nameFa,
      city: coach.city,
    })),
  })
})
