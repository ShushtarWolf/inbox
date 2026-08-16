import type { ClubStatus } from '@prisma/client'
import { siteUrl } from '../../../../utils/email'
import { sendNotification } from '../../../../utils/notify'

const ALLOWED: ClubStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED']

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ status?: ClubStatus }>(event)
  if (!id || !body.status || !ALLOWED.includes(body.status)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, email: true, name: true, phone: true } },
      application: { select: { id: true, status: true, clubName: true } },
    },
  })
  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  const previousStatus = club.status
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.club.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.status === 'ACTIVE' && !club.verifiedAt ? { verifiedAt: new Date() } : {}),
      },
      include: {
        owner: { select: { id: true, email: true, name: true, phone: true } },
      },
    })

    if (body.status === 'ACTIVE' && club.application?.status === 'PENDING') {
      await tx.clubApplication.update({
        where: { id: club.application.id },
        data: { status: 'APPROVED' },
      })
    }

    if (body.status === 'SUSPENDED' && club.application?.status === 'PENDING') {
      await tx.clubApplication.update({
        where: { id: club.application.id },
        data: { status: 'REJECTED' },
      })
    }

    return next
  })

  if (body.status === 'ACTIVE' && previousStatus !== 'ACTIVE' && updated.owner) {
    try {
      await sendNotification({
        channel: 'email',
        to: updated.owner.email,
        template: 'CLUB_APPROVED',
        data: {
          clubName: club.nameFa,
          loginUrl: `${siteUrl()}/login`,
        },
      })
    } catch (err) {
      console.error('[admin:club-status:email]', err)
    }

    if (updated.owner.phone) {
      try {
        await sendNotification({
          channel: 'sms',
          to: updated.owner.phone,
          template: 'CLUB_APPROVED',
          data: { clubName: club.nameFa },
          clubId: club.id,
        })
      } catch (err) {
        console.error('[admin:club-status:sms]', err)
      }
    }
  }

  return {
    id: updated.id,
    slug: updated.slug,
    status: updated.status,
    nameFa: updated.nameFa,
    nameEn: updated.nameEn,
    owner: updated.owner,
  }
})
