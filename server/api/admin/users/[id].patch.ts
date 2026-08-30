import type { Role } from '@prisma/client'
import { assignAddedRole, hasRole, packRoleSlots, userRoles, type PlatformRole } from '#shared/roles.ts'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ disabled?: boolean; role?: Role }>(event)
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const data: {
    disabledAt?: Date | null
    role?: Role
    secondaryRole?: Role | null
    tertiaryRole?: Role | null
  } = {}
  if (typeof body.disabled === 'boolean') {
    data.disabledAt = body.disabled ? new Date() : null
  }
  if (body.role && ['ATHLETE', 'COACH', 'CLUB_ADMIN'].includes(body.role)) {
    const target = body.role as PlatformRole
    // Additive: never wipe held roles when admin sets a platform role.
    if (hasRole(user, target)) {
      const packed = packRoleSlots(userRoles(user))
      data.role = packed.role
      data.secondaryRole = packed.secondaryRole
      data.tertiaryRole = packed.tertiaryRole
    }
    else {
      const assigned = assignAddedRole(user, target)
      if (!assigned) {
        throw createError({ statusCode: 409, statusMessage: 'USER_ROLE_SLOT_FULL' })
      }
      data.role = assigned.role
      data.secondaryRole = assigned.secondaryRole
      data.tertiaryRole = assigned.tertiaryRole
    }
  }
  if (!Object.keys(data).length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      secondaryRole: true,
      tertiaryRole: true,
      disabledAt: true,
    },
  })

  return {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    secondaryRole: updated.secondaryRole,
    tertiaryRole: updated.tertiaryRole,
    disabled: Boolean(updated.disabledAt),
    disabledAt: updated.disabledAt,
  }
})
