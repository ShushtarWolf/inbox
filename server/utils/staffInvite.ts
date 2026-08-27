import type { H3Event } from 'h3'
import type { StaffRole } from '@prisma/client'
import { normalizeIranPhone, phoneToSyntheticEmail } from '#shared/phone.ts'
import { defaultPermissionsForRole, normalizePermissions } from '#shared/ownerPermissions.ts'
import {
  platformRoleForStaffInvite,
  resolveInviteRoleUpgrade,
} from '#shared/roles.ts'
import { parseInviteStaffRole } from '#shared/staffInvite.ts'
import { ensureActiveCoachClubLink } from './coachClubLinks'
import { isCoachProductDisabled } from './pilot'

/**
 * Provision / link a phone user onto club staff so they can OTP sign in.
 * Coach role is blocked when the coach product is disabled in pilot mode.
 */
export async function inviteClubStaffByPhone(opts: {
  event?: H3Event
  club: { id: string; city: string }
  phoneRaw: string
  name?: string
  role?: string
  permissions?: string[]
}) {
  const role = parseInviteStaffRole(opts.role)
  if (role === 'COACH' && isCoachProductDisabled(opts.event)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Coach product is disabled in pilot mode',
    })
  }

  const phone = normalizeIranPhone(opts.phoneRaw)
  const name = opts.name?.trim() || phone || 'Staff'
  const permissions = opts.permissions?.length
    ? normalizePermissions(opts.permissions)
    : defaultPermissionsForRole(role)
  if (!phone) throw createError({ statusCode: 400, statusMessage: 'Invalid phone' })
  if (!permissions.length) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const targetPlatformRole = platformRoleForStaffInvite(role)
  let user = await prisma.user.findUnique({ where: { phone } })
  let created = false

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: phoneToSyntheticEmail(phone),
        phone,
        name,
        nameEn: name,
        role: targetPlatformRole,
        locale: 'fa',
      },
    })
    created = true
  }
  else {
    if (user.disabledAt) {
      throw createError({ statusCode: 403, statusMessage: 'Account disabled' })
    }
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
          city: opts.club.city,
          sportId: sport.id,
          clubId: opts.club.id,
          userId: user.id,
          approvalStatus: 'APPROVED',
          reviewedAt: new Date(),
        },
      })
    }
    else {
      await prisma.coach.update({
        where: { id: coach.id },
        data: {
          ...(coach.clubId ? {} : { clubId: opts.club.id }),
          ...(coach.approvalStatus === 'APPROVED'
            ? {}
            : { approvalStatus: 'APPROVED', approvalNote: null, reviewedAt: new Date() }),
        },
      })
      if (!coach.clubId) coach = { ...coach, clubId: opts.club.id }
    }

    await ensureActiveCoachClubLink(coach.id, opts.club.id)
  }

  const membership = await prisma.staffMembership.upsert({
    where: { userId_clubId_role: { userId: user.id, clubId: opts.club.id, role: role as StaffRole } },
    create: {
      userId: user.id,
      clubId: opts.club.id,
      role: role as StaffRole,
      coachId: coach?.id,
      permissionsJson: JSON.stringify(permissions),
      active: true,
    },
    update: { active: true, coachId: coach?.id, permissionsJson: JSON.stringify(permissions) },
  })

  return { id: membership.id, phone, created, role, permissions }
}
