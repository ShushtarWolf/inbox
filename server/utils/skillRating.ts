import type { Prisma } from '@prisma/client'
import {
  applySkillRatingUpdate,
  clampSkillRating,
  computeInitialSkillRating,
  type EloUpdateInput,
  type SkillQuestionnaireAnswers,
} from '#shared/skillRating.ts'
import { prisma } from './prisma'

type DbClient = Prisma.TransactionClient | typeof prisma

export async function getOrCreateUserSportSkill(
  userId: string,
  sportId: string,
  db: DbClient = prisma,
) {
  const existing = await db.userSportSkillRating.findUnique({
    where: { userId_sportId: { userId, sportId } },
  })
  if (existing) return existing
  return db.userSportSkillRating.create({
    data: { userId, sportId },
  })
}

export async function submitSkillAssessment(opts: {
  userId: string
  sportId: string
  answers: SkillQuestionnaireAnswers
  db?: DbClient
}) {
  const db = opts.db || prisma
  const { rating, confidence } = computeInitialSkillRating(opts.answers)
  const row = await getOrCreateUserSportSkill(opts.userId, opts.sportId, db)
  const previousRating = row.rating
  const previousConfidence = row.confidence

  const updated = await db.userSportSkillRating.update({
    where: { id: row.id },
    data: {
      rating,
      confidence,
      assessmentStatus: 'ASSESSED',
      assessedAt: new Date(),
    },
  })

  await db.skillRatingHistory.create({
    data: {
      userSportSkillRatingId: row.id,
      previousRating,
      newRating: rating,
      previousConfidence,
      newConfidence: confidence,
      reason: 'initial_assessment',
      metadataJson: JSON.stringify({ answers: opts.answers }),
    },
  })

  return updated
}

async function appendSkillHistory(
  db: DbClient,
  rowId: string,
  previous: { rating: number, confidence: number },
  next: { rating: number, confidence: number },
  reason: string,
  openMatchId?: string,
  metadata?: Record<string, unknown>,
) {
  await db.skillRatingHistory.create({
    data: {
      userSportSkillRatingId: rowId,
      previousRating: previous.rating,
      newRating: next.rating,
      previousConfidence: previous.confidence,
      newConfidence: next.confidence,
      reason,
      openMatchId,
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
    },
  })
}

export async function applyPostMatchSkillUpdates(opts: {
  openMatchId: string
  sportId: string
  matchType: 'FRIENDLY' | 'COMPETITIVE'
  userOutcomes: Array<{
    userId: string
    outcome: number
    opponentRating: number
    peerPerceivedLevel?: number | null
    fairPlayScore?: number | null
  }>
  db?: DbClient
}) {
  const db = opts.db || prisma
  const run = async (tx: Prisma.TransactionClient) => {
    for (const row of opts.userOutcomes) {
      const skill = await getOrCreateUserSportSkill(row.userId, opts.sportId, tx)
      const input: EloUpdateInput = {
        currentRating: skill.rating,
        currentConfidence: skill.confidence,
        outcome: row.outcome,
        opponentRating: row.opponentRating,
        peerPerceivedLevel: row.peerPerceivedLevel,
        fairPlayScore: row.fairPlayScore,
        matchType: opts.matchType,
      }
      const next = applySkillRatingUpdate(input)
      const previous = { rating: skill.rating, confidence: skill.confidence }
      await tx.userSportSkillRating.update({
        where: { id: skill.id },
        data: {
          rating: next.rating,
          confidence: next.confidence,
          matchesPlayed: { increment: 1 },
          assessmentStatus: skill.assessmentStatus === 'UNASSESSED' ? 'ASSESSED' : skill.assessmentStatus,
          assessedAt: skill.assessedAt || new Date(),
        },
      })
      await appendSkillHistory(tx, skill.id, previous, {
        rating: next.rating,
        confidence: next.confidence,
      }, 'post_match', opts.openMatchId, { delta: next.delta })
    }
  }
  if (db === prisma) return prisma.$transaction(run)
  return run(db as Prisma.TransactionClient)
}

export async function readUserSkillForSport(userId: string, sportId: string) {
  const row = await prisma.userSportSkillRating.findUnique({
    where: { userId_sportId: { userId, sportId } },
  })
  return row
    ? { rating: clampSkillRating(row.rating), confidence: row.confidence, assessmentStatus: row.assessmentStatus }
    : { rating: null as number | null, confidence: 0, assessmentStatus: 'UNASSESSED' as const }
}