import type { H3Event } from 'h3'
import {
  getCompetitionsPilotClubSlug,
  isCompetitionsEnabled,
  isCompetitionsVisibleForClub,
  type CompetitionsGateOptions,
} from '../../shared/competition.ts'

function runtimeGateOptions(event?: H3Event): CompetitionsGateOptions | undefined {
  if (!event) return undefined
  try {
    const publicConfig = useRuntimeConfig(event).public as {
      competitionsEnabled?: boolean
      competitionsPilotClubSlug?: string
    }
    return {
      enabled: Boolean(publicConfig.competitionsEnabled),
      pilotClubSlug: String(publicConfig.competitionsPilotClubSlug || '').trim() || null,
    }
  } catch {
    return undefined
  }
}

function mergeGateOptions(event?: H3Event): CompetitionsGateOptions {
  const runtime = runtimeGateOptions(event)
  return {
    enabled: isCompetitionsEnabled() || Boolean(runtime?.enabled),
    pilotClubSlug: getCompetitionsPilotClubSlug() ?? runtime?.pilotClubSlug ?? null,
  }
}

export function competitionsFeatureEnabled(event?: H3Event): boolean {
  return isCompetitionsEnabled(mergeGateOptions(event))
}

export function competitionsPilotClubSlug(event?: H3Event): string | null {
  return getCompetitionsPilotClubSlug(mergeGateOptions(event))
}

export function competitionsVisibleForClub(clubSlug: string | null | undefined, event?: H3Event): boolean {
  return isCompetitionsVisibleForClub(clubSlug, mergeGateOptions(event))
}

export function assertCompetitionsFeatureEnabled(event?: H3Event) {
  if (!competitionsFeatureEnabled(event)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}

export function assertCompetitionsVisibleForClub(clubSlug: string | null | undefined, event?: H3Event) {
  if (!competitionsVisibleForClub(clubSlug, event)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}

export async function assertCompetitionAccessById(event: H3Event, competitionId: string) {
  const row = await prisma.competition.findFirst({
    where: { id: competitionId },
    select: { club: { select: { slug: true } } },
  })
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  assertCompetitionsVisibleForClub(row.club.slug, event)
}
