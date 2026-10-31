import { clampDiscountPercent } from '#shared/discountCode.ts'
import {
  membershipExpiresAt,
  pickBestDiscountMembership,
} from '#shared/discountMembership.ts'
import { parseClubImageInput } from '#shared/clubImageUrl.ts'
import { createInAppNotification } from './notify'
import { assertNoApprovedStudentNumberConflict } from './studentVerificationDuplicate'

const MAX_PROOF_URLS = 2

export function parseProofUrls(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(raw) as unknown
            return Array.isArray(parsed) ? parsed : []
          }
          catch {
            return []
          }
        })()
      : []
  const urls: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const parsed = parseClubImageInput(item)
    if (!parsed.ok || !parsed.value) continue
    urls.push(parsed.value)
    if (urls.length >= MAX_PROOF_URLS) break
  }
  return urls
}

export async function findBestActiveMembership(opts: {
  clubId: string
  userId: string
  now?: Date
}) {
  const now = opts.now || new Date()
  const rows = await prisma.discountMembership.findMany({
    where: {
      clubId: opts.clubId,
      userId: opts.userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      program: { active: true },
    },
    select: {
      id: true,
      percent: true,
      labelFa: true,
      labelEn: true,
      expiresAt: true,
      revokedAt: true,
      program: { select: { active: true } },
    },
  })
  return pickBestDiscountMembership(
    rows.map((row) => ({
      ...row,
      programActive: row.program.active,
    })),
    now,
  )
}

export async function approveDiscountApplication(opts: {
  applicationId: string
  clubId: string
  reviewerId: string
}) {
  const app = await prisma.discountApplication.findFirst({
    where: { id: opts.applicationId, clubId: opts.clubId },
    include: {
      program: true,
      user: { select: { id: true, name: true } },
    },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  if (app.status !== 'PENDING') {
    throw createError({ statusCode: 400, statusMessage: 'Application already reviewed' })
  }
  if (!app.program.active) {
    throw createError({ statusCode: 400, statusMessage: 'Program inactive' })
  }

  if (app.program.verificationKind === 'STUDENT' && app.studentNumber) {
    await assertNoApprovedStudentNumberConflict({
      clubId: app.clubId,
      studentNumber: app.studentNumber,
      excludeUserId: app.userId,
      excludeApplicationId: app.id,
    })
  }

  const percent = clampDiscountPercent(app.program.percent)
  if (percent < 1) throw createError({ statusCode: 400, statusMessage: 'Invalid percent' })

  const approvedAt = new Date()
  const expiresAt = membershipExpiresAt(approvedAt, app.program.validityMonths)

  await prisma.$transaction(async (tx) => {
    await tx.discountApplication.update({
      where: { id: app.id },
      data: {
        status: 'APPROVED',
        rejectReason: null,
        reviewedAt: approvedAt,
        reviewedById: opts.reviewerId,
      },
    })
    await tx.discountMembership.upsert({
      where: { programId_userId: { programId: app.programId, userId: app.userId } },
      create: {
        programId: app.programId,
        clubId: app.clubId,
        userId: app.userId,
        percent,
        labelFa: app.program.titleFa,
        labelEn: app.program.titleEn,
        approvedAt,
        expiresAt,
        revokedAt: null,
      },
      update: {
        percent,
        labelFa: app.program.titleFa,
        labelEn: app.program.titleEn,
        approvedAt,
        expiresAt,
        revokedAt: null,
      },
    })
  })

  await createInAppNotification({
    userId: app.userId,
    type: 'DISCOUNT_APPROVED',
    title: 'تخفیف تأیید شد',
    body: `تخفیف «${app.program.titleFa}» (${percent}٪) برای این باشگاه فعال شد.`,
    metadata: { clubId: app.clubId, programId: app.programId, percent },
  }).catch(() => null)

  return { ok: true as const }
}

export async function rejectDiscountApplication(opts: {
  applicationId: string
  clubId: string
  reviewerId: string
  reason?: string | null
}) {
  const app = await prisma.discountApplication.findFirst({
    where: { id: opts.applicationId, clubId: opts.clubId },
    include: { program: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  if (app.status !== 'PENDING') {
    throw createError({ statusCode: 400, statusMessage: 'Application already reviewed' })
  }

  const reason = opts.reason?.trim() || null
  await prisma.discountApplication.update({
    where: { id: app.id },
    data: {
      status: 'REJECTED',
      rejectReason: reason,
      reviewedAt: new Date(),
      reviewedById: opts.reviewerId,
    },
  })

  await createInAppNotification({
    userId: app.userId,
    type: 'DISCOUNT_REJECTED',
    title: 'درخواست تخفیف رد شد',
    body: reason
      ? `درخواست «${app.program.titleFa}» رد شد: ${reason}`
      : `درخواست «${app.program.titleFa}» رد شد.`,
    metadata: { clubId: app.clubId, programId: app.programId, reason },
  }).catch(() => null)

  return { ok: true as const }
}

export async function revokeDiscountMembership(opts: {
  membershipId: string
  clubId: string
}) {
  const row = await prisma.discountMembership.findFirst({
    where: { id: opts.membershipId, clubId: opts.clubId, revokedAt: null },
  })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Membership not found' })
  await prisma.discountMembership.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  })
  return { ok: true as const }
}

export function serializeApplicationForOwner(
  app: {
    id: string
    status: string
    note: string | null
    rejectReason: string | null
    proofUrlsJson: string
    fullName: string | null
    studentNumber: string | null
    ownershipConfirmed: boolean
    createdAt: Date
    reviewedAt: Date | null
    user: { id: string; name: string; phone: string | null }
    program: {
      id: string
      titleFa: string
      titleEn: string | null
      percent: number
      verificationKind: string
    }
  },
) {
  return {
    id: app.id,
    status: app.status,
    note: app.note,
    rejectReason: app.rejectReason,
    proofUrls: parseProofUrls(app.proofUrlsJson),
    fullName: app.fullName,
    studentNumber: app.studentNumber,
    ownershipConfirmed: app.ownershipConfirmed,
    createdAt: app.createdAt.toISOString(),
    reviewedAt: app.reviewedAt?.toISOString() || null,
    user: {
      id: app.user.id,
      name: app.user.name,
      phone: app.user.phone,
    },
    program: {
      id: app.program.id,
      titleFa: app.program.titleFa,
      titleEn: app.program.titleEn,
      percent: app.program.percent,
      verificationKind: app.program.verificationKind,
    },
  }
}
