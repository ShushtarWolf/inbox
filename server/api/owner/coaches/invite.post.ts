import { randomBytes } from 'node:crypto'
import type { StaffRole } from '@prisma/client'
import { defaultPermissionsForRole, normalizePermissions } from '#shared/ownerPermissions.ts'
import {
  platformRoleForStaffInvite,
  resolveInviteRoleUpgrade,
} from '#shared/roles.ts'

const validRoles = new Set<StaffRole>(['MANAGER', 'ANALYST', 'FRONT_DESK', 'COACH'])

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const { club } = await requireOwnerClub(event, 'team')
  const body = await readBody<{ email?: string; role?: StaffRole; name?: string; permissions?: string[] }>(event)
  const email = body.email?.trim().toLowerCase()
  const role = body.role && validRoles.has(body.role) ? body.role : 'COACH'
  const name = body.name?.trim() || email?.split('@')[0] || 'Coach'
  const permissions = body.permissions?.length
    ? normalizePermissions(body.permissions)
    : defaultPermissionsForRole(role)
  if (!email) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  if (!permissions.length) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const targetPlatformRole = platformRoleForStaffInvite(role)
  let user = await prisma.user.findUnique({ where: { email } })
  const tempPassword = randomBytes(12).toString('base64url')
  let createdPassword: string | undefined

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        nameEn: name,
        role: targetPlatformRole,
        passwordHash: hashSecret(tempPassword),
      },
    })
    createdPassword = tempPassword
  }
  else {
    const upgrade = resolveInviteRoleUpgrade(user, targetPlatformRole)
    if (upgrade === 'slot_full') {
      throw createError({ statusCode: 409, statusMessage: 'USER_ROLE_SLOT_FULL' })
    }
    if (upgrade !== 'already_has') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          role: upgrade.role,
          secondaryRole: upgrade.secondaryRole,
        },
      })
    }
  }

  let coach = role === 'COACH'
    ? await prisma.coach.findFirst({ where: { userId: user.id } })
    : null

  if (role === 'COACH') {
    if (!coach) {
      const sport = await prisma.sport.findFirstOrThrow({ where: { slug: 'padel' } })
      coach = await prisma.coach.create({
        data: {
          nameFa: name,
          nameEn: name,
          city: club.city,
          sportId: sport.id,
          clubId: club.id,
          userId: user.id,
          approvalStatus: 'APPROVED',
          reviewedAt: new Date(),
        },
      })
    }
    else {
      // Existing coach invited as staff: keep primary club if unset; ensure APPROVED for booking.
      await prisma.coach.update({
        where: { id: coach.id },
        data: {
          ...(coach.clubId ? {} : { clubId: club.id }),
          ...(coach.approvalStatus === 'APPROVED'
            ? {}
            : { approvalStatus: 'APPROVED', approvalNote: null, reviewedAt: new Date() }),
        },
      })
      if (!coach.clubId) coach = { ...coach, clubId: club.id }
    }

    await ensureActiveCoachClubLink(coach.id, club.id)
  }

  const membership = await prisma.staffMembership.upsert({
    where: { userId_clubId_role: { userId: user.id, clubId: club.id, role } },
    create: {
      userId: user.id,
      clubId: club.id,
      role,
      coachId: coach?.id,
      permissionsJson: JSON.stringify(permissions),
      active: true,
    },
    update: { active: true, coachId: coach?.id, permissionsJson: JSON.stringify(permissions) },
  })

  return { id: membership.id, email, temporaryPassword: createdPassword }
})
