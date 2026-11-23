import { requireUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ clubId?: string }>(event)
  const clubId = body.clubId?.trim()
  if (!clubId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const membership = await prisma.staffMembership.findFirst({
    where: {
      userId: user.id,
      clubId,
      active: true,
      role: { in: ['OWNER', 'MANAGER', 'ANALYST', 'FRONT_DESK', 'COACH'] },
    },
    include: {
      club: {
        select: {
          id: true,
          slug: true,
          nameFa: true,
          nameEn: true,
          status: true,
          image: true,
        },
      },
    },
  })

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  setCookie(event, 'owner_club_id', clubId, { path: '/', sameSite: 'lax' })

  return {
    clubId,
    club: membership.club,
    membership: {
      role: membership.role,
      isPrimary: membership.isPrimary,
    },
  }
})