import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

type DbClient = PrismaClient | Prisma.TransactionClient

/** The signed-in coach's own profile, rejected unless the platform admin has accepted them. */
export async function requireApprovedCoach(userId: string) {
  const coach = await prisma.coach.findUnique({ where: { userId } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })
  if (coach.approvalStatus !== 'APPROVED') {
    throw createError({ statusCode: 403, statusMessage: 'COACH_NOT_APPROVED' })
  }
  return coach
}

/**
 * Queue a club affiliation request. Idempotent: returns the existing row if already linked.
 * Owner UI only lists links once the coach is platform-APPROVED.
 */
export async function ensurePendingCoachClubLink(
  coachId: string,
  clubId: string,
  db: DbClient = prisma,
) {
  const existing = await db.coachClubLink.findUnique({
    where: { coachId_clubId: { coachId, clubId } },
  })
  if (existing) return existing
  return db.coachClubLink.create({
    data: { coachId, clubId },
  })
}

/**
 * Legacy coaches may have Coach.clubId set without a CoachClubLink. Heal that so the
 * club owner sees a PENDING request under مربی‌های مستقل.
 * Primary display club must remain ACTIVE-only — clear primary until the owner accepts.
 */
export async function backfillClubLinkFromPrimaryClub(
  coach: { id: string; clubId: string | null },
  db: DbClient = prisma,
) {
  if (!clubIdIsSet(coach.clubId)) return null
  const clubId = coach.clubId as string
  const club = await db.club.findFirst({ where: { id: clubId, status: 'ACTIVE' }, select: { id: true } })
  if (!club) {
    await db.coach.update({ where: { id: coach.id }, data: { clubId: null } })
    return null
  }
  const link = await ensurePendingCoachClubLink(coach.id, club.id, db)
  if (link.status !== 'ACTIVE') {
    await db.coach.updateMany({
      where: { id: coach.id, clubId: club.id },
      data: { clubId: null },
    })
  }
  return link
}

function clubIdIsSet(clubId: string | null | undefined): clubId is string {
  return Boolean(clubId && clubId.trim())
}

/**
 * A coach may only book courts at clubs whose owner accepted the link, because that link
 * carries the discount percent the club agreed to bill the coach at.
 */
export async function requireActiveCoachClubLink(coachId: string, clubId: string) {
  const link = await prisma.coachClubLink.findUnique({
    where: { coachId_clubId: { coachId, clubId } },
    include: { club: true },
  })
  if (!link || link.status !== 'ACTIVE') {
    throw createError({ statusCode: 403, statusMessage: 'COACH_CLUB_LINK_NOT_ACTIVE' })
  }
  if (link.club.status !== 'ACTIVE') {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }
  return link
}
