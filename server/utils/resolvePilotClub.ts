import { createError } from 'h3'
import {
  defaultPilotClubWhere,
  isRetiredPilotClubName,
} from '#shared/pilotClub.ts'
import { prisma } from './prisma'

type PilotClubRow = { id: string; slug: string; nameFa: string }

/** Resolve the live IUST pilot. Never returns باشگاه بهناز. */
export async function resolvePilotClub(body?: { clubId?: string; slug?: string }): Promise<PilotClubRow> {
  let club: PilotClubRow | null = null

  if (body?.clubId) {
    club = await prisma.club.findUnique({
      where: { id: body.clubId },
      select: { id: true, slug: true, nameFa: true },
    })
  } else if (body?.slug) {
    club = await prisma.club.findUnique({
      where: { slug: body.slug },
      select: { id: true, slug: true, nameFa: true },
    })
  } else {
    club = await prisma.club.findFirst({
      where: defaultPilotClubWhere(),
      orderBy: { verifiedAt: 'desc' },
      select: { id: true, slug: true, nameFa: true },
    })
  }

  if (!club || isRetiredPilotClubName(club.nameFa)) {
    throw createError({ statusCode: 404, statusMessage: 'Pilot club not found' })
  }
  return club
}
