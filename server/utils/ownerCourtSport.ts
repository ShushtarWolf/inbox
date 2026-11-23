/** Default court sport when owner POST/PATCH omits sportSlug (e.g. /owner/setup). */

export type OwnerCourtSportSlug = 'padel' | 'tennis'

export function normalizeOwnerCourtSportSlug(raw?: string | null): OwnerCourtSportSlug | null {
  if (raw === 'tennis') return 'tennis'
  if (raw === 'padel') return 'padel'
  return null
}

export function ownerCourtSportSlugFromApplication(
  sportSlug?: string | null,
): OwnerCourtSportSlug {
  return sportSlug === 'tennis' ? 'tennis' : 'padel'
}

type CourtSportRow = { sport: { slug: string } }

/** Infer default sport for new courts on a club (application → existing courts → padel). */
export function inferOwnerCourtSportSlug(
  applicationSportSlug: string | null | undefined,
  existingCourts: CourtSportRow[],
): OwnerCourtSportSlug {
  if (applicationSportSlug === 'tennis' || applicationSportSlug === 'padel') {
    return applicationSportSlug
  }
  const tennisCount = existingCourts.filter((c) => c.sport.slug === 'tennis').length
  const padelCount = existingCourts.filter((c) => c.sport.slug === 'padel').length
  if (tennisCount > padelCount) return 'tennis'
  if (padelCount > tennisCount) return 'padel'
  if (existingCourts[0]?.sport.slug === 'tennis') return 'tennis'
  return 'padel'
}

export async function resolveOwnerCourtSportForClub(
  clubId: string,
  explicitSlug?: string | null,
): Promise<{ slug: OwnerCourtSportSlug; sportId: string }> {
  const normalized = normalizeOwnerCourtSportSlug(explicitSlug)
  if (normalized) {
    const sport = await prisma.sport.findFirst({ where: { slug: normalized } })
    if (!sport) throw createError({ statusCode: 400, statusMessage: 'Invalid sport' })
    return { slug: normalized, sportId: sport.id }
  }

  const [application, courts] = await Promise.all([
    prisma.clubApplication.findFirst({
      where: { clubId },
      select: { sportSlug: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.court.findMany({
      where: { clubId },
      select: { sport: { select: { slug: true } } },
      take: 50,
    }),
  ])

  const slug = inferOwnerCourtSportSlug(application?.sportSlug, courts)
  const sport = await prisma.sport.findFirst({ where: { slug } })
  if (!sport) throw createError({ statusCode: 500, statusMessage: `Sport missing: ${slug}` })
  return { slug, sportId: sport.id }
}