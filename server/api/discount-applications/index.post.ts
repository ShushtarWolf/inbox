import { parseProofUrls } from '../../utils/discountMemberships'
import { createInAppNotification } from '../../utils/notify'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    programId?: string
    proofUrls?: string[]
    note?: string | null
  }>(event)

  const programId = typeof body?.programId === 'string' ? body.programId.trim() : ''
  if (!programId) throw createError({ statusCode: 400, statusMessage: 'programId required' })

  const proofUrls = parseProofUrls(body?.proofUrls)
  if (!proofUrls.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one proof image required' })
  }

  const program = await prisma.discountProgram.findFirst({
    where: { id: programId, active: true },
    include: { club: { select: { id: true, nameFa: true, ownerId: true } } },
  })
  if (!program) throw createError({ statusCode: 404, statusMessage: 'Program not found' })

  const existingMembership = await prisma.discountMembership.findFirst({
    where: {
      programId,
      userId: user.id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  })
  if (existingMembership) {
    throw createError({ statusCode: 409, statusMessage: 'Already approved for this program' })
  }

  const existing = await prisma.discountApplication.findUnique({
    where: { programId_userId: { programId, userId: user.id } },
  })
  if (existing?.status === 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: 'Application already pending' })
  }

  const note = body?.note?.trim()?.slice(0, 300) || null
  const proofUrlsJson = JSON.stringify(proofUrls)

  const row = existing
    ? await prisma.discountApplication.update({
        where: { id: existing.id },
        data: {
          proofUrlsJson,
          note,
          status: 'PENDING',
          rejectReason: null,
          reviewedAt: null,
          reviewedById: null,
        },
      })
    : await prisma.discountApplication.create({
        data: {
          programId,
          clubId: program.clubId,
          userId: user.id,
          proofUrlsJson,
          note,
          status: 'PENDING',
        },
      })

  // Notify club owner (best-effort).
  if (program.club.ownerId) {
    await createInAppNotification({
      userId: program.club.ownerId,
      type: 'DISCOUNT_APPLICATION',
      title: 'درخواست تخفیف جدید',
      body: `${user.name} برای «${program.titleFa}» مدرک فرستاد.`,
      metadata: { clubId: program.clubId, applicationId: row.id, programId },
    }).catch(() => null)
  }

  return {
    id: row.id,
    status: row.status,
    programId: row.programId,
  }
})
