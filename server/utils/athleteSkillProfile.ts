import type { OpenMatchStatus, OpenMatchType } from '@prisma/client'
import {
  buildSportSkillLabels,
  confidenceToPercent,
  outcomeLetterFromDelta,
  type MatchOutcomeLetter,
  progressToNextHalfTier,
  type SkillProgressionPoint,
  winRatePercent,
} from '#shared/skillProfile.ts'
import { clampSkillRating } from '#shared/skillRating.ts'
import { prisma } from './prisma'

type HistoryRow = {
  id: string
  createdAt: Date
  previousRating: number
  newRating: number
  reason: string
  openMatchId: string | null
  metadataJson: string | null
}

function parseHistoryDelta(row: HistoryRow): number {
  if (row.metadataJson) {
    try {
      const meta = JSON.parse(row.metadataJson) as { delta?: number }
      if (typeof meta.delta === 'number' && Number.isFinite(meta.delta)) return meta.delta
    } catch {
      /* ignore */
    }
  }
  return Math.round((row.newRating - row.previousRating) * 100) / 100
}

function deltaByMatchId(history: HistoryRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of history) {
    if (!row.openMatchId || row.reason !== 'post_match') continue
    map.set(row.openMatchId, parseHistoryDelta(row))
  }
  return map
}

function aggregateMatchOutcomes(
  matches: Array<{
    id: string
    status: OpenMatchStatus
    matchType: OpenMatchType
    completedAt: Date | null
  }>,
  deltas: Map<string, number>,
): { wins: number, losses: number, draws: number, recentForm: MatchOutcomeLetter[] } {
  let wins = 0
  let losses = 0
  let draws = 0
  const letters: MatchOutcomeLetter[] = []
  const sorted = [...matches].sort((a, b) => {
    const at = a.completedAt?.getTime() ?? 0
    const bt = b.completedAt?.getTime() ?? 0
    return bt - at
  })

  for (const m of sorted) {
    const letter = outcomeLetterFromDelta(deltas.get(m.id), m.matchType, m.status)
    if (letter === 'W') wins += 1
    else if (letter === 'L') losses += 1
    else if (letter === 'D') draws += 1
    if (letter !== 'P') letters.push(letter)
  }

  return { wins, losses, draws, recentForm: letters.slice(0, 5) }
}

function formatScoreSummary(scoreJson: string | undefined): string | null {
  if (!scoreJson) return null
  try {
    const score = JSON.parse(scoreJson) as { home?: number, away?: number }
    if (typeof score.home === 'number' && typeof score.away === 'number') {
      return `${score.home}–${score.away}`
    }
  } catch {
    /* ignore */
  }
  return null
}

export async function buildAthleteSkillProfile(userId: string) {
  const skillRows = await prisma.userSportSkillRating.findMany({
    where: { userId },
    include: {
      sport: { select: { id: true, slug: true, nameFa: true, nameEn: true } },
      history: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const participants = await prisma.openMatchParticipant.findMany({
    where: { userId, status: 'JOINED' },
    include: {
      openMatch: {
        include: {
          sport: { select: { id: true, slug: true, nameFa: true } },
          club: { select: { nameFa: true, nameEn: true } },
          court: { select: { nameFa: true } },
          slot: { select: { date: true, startTime: true, endTime: true } },
          results: { orderBy: { submittedAt: 'desc' }, take: 1 },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
    take: 25,
  })

  const sports = skillRows.map((row) => {
    const history = row.history as HistoryRow[]
    const deltas = deltaByMatchId(history)
    const sportMatches = participants
      .filter((p) => p.openMatch.sportId === row.sportId)
      .map((p) => ({
        id: p.openMatch.id,
        status: p.openMatch.status,
        matchType: p.openMatch.matchType,
        completedAt: p.openMatch.completedAt,
      }))
      .filter((m, idx, arr) => arr.findIndex((x) => x.id === m.id) === idx)

    const { wins, losses, draws, recentForm } = aggregateMatchOutcomes(sportMatches, deltas)
    const rating = clampSkillRating(row.rating)
    const { labelFa, descriptionFa } = buildSportSkillLabels(rating)
    const tier = progressToNextHalfTier(rating)
    const lastHist = history[history.length - 1]
    const lastDelta = lastHist ? parseHistoryDelta(lastHist) : 0

    const progression: SkillProgressionPoint[] = history.map((h) => ({
      id: h.id,
      createdAt: h.createdAt.toISOString(),
      rating: clampSkillRating(h.newRating),
      delta: parseHistoryDelta(h),
      reason: h.reason,
      matchId: h.openMatchId,
    }))

    if (progression.length === 0 && row.assessmentStatus === 'ASSESSED') {
      progression.push({
        id: `synthetic-${row.id}`,
        createdAt: (row.assessedAt || row.createdAt).toISOString(),
        rating,
        delta: 0,
        reason: 'initial_assessment',
        matchId: null,
      })
    }

    return {
      sportId: row.sportId,
      sportSlug: row.sport.slug,
      sportNameFa: row.sport.nameFa,
      assessmentStatus: row.assessmentStatus,
      rating,
      labelFa,
      descriptionFa,
      reliabilityPercent: confidenceToPercent(row.confidence),
      nextTier: tier.nextTier,
      progressToNextTier: tier.progressPercent,
      matchesPlayed: row.matchesPlayed || sportMatches.filter((m) => m.status === 'COMPLETED').length,
      wins,
      losses,
      draws,
      winRate: winRatePercent(wins, losses, draws),
      recentForm,
      lastDelta,
      progression,
    }
  })

  const recentMatches = participants.map((p) => {
    const m = p.openMatch
    const sportProfile = sports.find((s) => s.sportId === m.sportId)
    const deltaMap = sportProfile
      ? deltaByMatchId((skillRows.find((r) => r.sportId === m.sportId)?.history || []) as HistoryRow[])
      : new Map<string, number>()
    const delta = deltaMap.get(m.id) ?? null
    const letter = outcomeLetterFromDelta(delta, m.matchType, m.status)
    const score = formatScoreSummary(m.results[0]?.scoreJson)
    return {
      id: m.id,
      sportId: m.sportId,
      sportNameFa: m.sport.nameFa,
      clubNameFa: m.club.nameFa,
      courtNameFa: m.court?.nameFa || null,
      date: m.slot.date,
      startTime: m.slot.startTime,
      endTime: m.slot.endTime,
      status: m.status,
      matchType: m.matchType,
      outcome: letter,
      scoreSummary: score,
      ratingDelta: delta,
      path: `/athlete/open-match/${m.id}`,
    }
  }).filter((row, idx, arr) => arr.findIndex((x) => x.id === row.id) === idx).slice(0, 12)

  const assessedSports = sports.filter((s) => s.assessmentStatus === 'ASSESSED')

  return {
    sports: assessedSports,
    recentMatches,
    hasAssessedSport: assessedSports.length > 0,
  }
}