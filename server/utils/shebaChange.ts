import type { Prisma, ShebaChangeStatus, ShebaChangeSubject } from '@prisma/client'
import { isValidSheba, normalizeSheba } from '#shared/settlement.ts'
import { shebaChangeNeeded } from '#shared/shebaApproval.ts'

export function parseShebaInput(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() || ''
  if (!trimmed) return null
  const sheba = normalizeSheba(trimmed)
  if (!sheba || !isValidSheba(sheba)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid SHEBA' })
  }
  return sheba
}

type Tx = Prisma.TransactionClient

async function upsertPendingRequest(
  tx: Tx,
  data: {
    subject: ShebaChangeSubject
    clubId?: string
    userId?: string
    previousSheba: string | null
    proposedSheba: string | null
  },
) {
  const where = data.subject === 'CLUB'
    ? { clubId: data.clubId!, status: 'PENDING' as ShebaChangeStatus }
    : { userId: data.userId!, status: 'PENDING' as ShebaChangeStatus }

  const existing = await tx.shebaChangeRequest.findFirst({ where })
  if (existing) {
    return tx.shebaChangeRequest.update({
      where: { id: existing.id },
      data: {
        proposedSheba: data.proposedSheba,
        previousSheba: data.previousSheba,
        adminNote: null,
        reviewedAt: null,
      },
    })
  }

  return tx.shebaChangeRequest.create({
    data: {
      subject: data.subject,
      clubId: data.clubId ?? null,
      userId: data.userId ?? null,
      previousSheba: data.previousSheba,
      proposedSheba: data.proposedSheba,
      status: 'PENDING',
    },
  })
}

export async function submitClubShebaChange(clubId: string, rawSheba: string | null | undefined) {
  const proposedSheba = rawSheba === null || rawSheba === undefined || rawSheba === ''
    ? null
    : parseShebaInput(rawSheba)

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { sheba: true },
  })
  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  if (!shebaChangeNeeded(club.sheba, proposedSheba)) {
    const pending = await prisma.shebaChangeRequest.findFirst({
      where: { clubId, status: 'PENDING' },
    })
    return { sheba: club.sheba, pendingRequest: pending }
  }

  const pendingRequest = await upsertPendingRequest(prisma, {
    subject: 'CLUB',
    clubId,
    previousSheba: club.sheba,
    proposedSheba,
  })

  return { sheba: club.sheba, pendingRequest }
}

export async function submitUserShebaChange(userId: string, rawSheba: string | null | undefined) {
  const proposedSheba = rawSheba === null || rawSheba === undefined || rawSheba === ''
    ? null
    : parseShebaInput(rawSheba)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sheba: true },
  })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  if (!shebaChangeNeeded(user.sheba, proposedSheba)) {
    const pending = await prisma.shebaChangeRequest.findFirst({
      where: { userId, status: 'PENDING' },
    })
    return { sheba: user.sheba, pendingRequest: pending }
  }

  const pendingRequest = await upsertPendingRequest(prisma, {
    subject: 'USER',
    userId,
    previousSheba: user.sheba,
    proposedSheba,
  })

  return { sheba: user.sheba, pendingRequest }
}

export async function getClubShebaState(clubId: string) {
  const [club, pendingRequest, lastRejected] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { sheba: true } }),
    prisma.shebaChangeRequest.findFirst({
      where: { clubId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shebaChangeRequest.findFirst({
      where: { clubId, status: 'REJECTED' },
      orderBy: { reviewedAt: 'desc' },
    }),
  ])
  return { sheba: club?.sheba ?? null, pendingRequest, lastRejected }
}

export async function getUserShebaState(userId: string) {
  const [user, pendingRequest, lastRejected] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { sheba: true } }),
    prisma.shebaChangeRequest.findFirst({
      where: { userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shebaChangeRequest.findFirst({
      where: { userId, status: 'REJECTED' },
      orderBy: { reviewedAt: 'desc' },
    }),
  ])
  return { sheba: user?.sheba ?? null, pendingRequest, lastRejected }
}

export function assertShebaApprovedForWithdraw(sheba: string | null | undefined) {
  const value = sheba?.trim() || null
  if (!value) {
    throw createError({ statusCode: 400, statusMessage: 'SHEBA is required before withdraw' })
  }
  return value
}

export async function approveShebaChangeRequest(requestId: string, adminNote?: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.shebaChangeRequest.findUnique({ where: { id: requestId } })
    if (!request) {
      throw createError({ statusCode: 404, statusMessage: 'Sheba change request not found' })
    }
    if (request.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'Sheba change request is not pending' })
    }

    const reviewedAt = new Date()
    const updated = await tx.shebaChangeRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        adminNote: adminNote ?? request.adminNote,
        reviewedAt,
      },
    })

    if (request.subject === 'CLUB' && request.clubId) {
      await tx.club.update({
        where: { id: request.clubId },
        data: { sheba: request.proposedSheba },
      })
    } else if (request.subject === 'USER' && request.userId) {
      await tx.user.update({
        where: { id: request.userId },
        data: { sheba: request.proposedSheba },
      })
    }

    return updated
  })
}

export async function rejectShebaChangeRequest(requestId: string, adminNote?: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.shebaChangeRequest.findUnique({ where: { id: requestId } })
    if (!request) {
      throw createError({ statusCode: 404, statusMessage: 'Sheba change request not found' })
    }
    if (request.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'Sheba change request is not pending' })
    }

    return tx.shebaChangeRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        adminNote: adminNote ?? request.adminNote,
        reviewedAt: new Date(),
      },
    })
  })
}

export function serializeShebaRequest(row: {
  id: string
  subject: string
  proposedSheba: string | null
  previousSheba: string | null
  status: string
  adminNote: string | null
  createdAt: Date
  reviewedAt: Date | null
}) {
  return {
    id: row.id,
    subject: row.subject,
    proposedSheba: row.proposedSheba,
    previousSheba: row.previousSheba,
    status: row.status,
    adminNote: row.adminNote,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }
}
