import { ALL_OWNER_PERMISSIONS, normalizePermissions, parsePermissions } from '#shared/ownerPermissions.ts'

export default defineEventHandler(async (event) => {
  const { club, membership: actorMembership } = await requireOwnerClub(event, 'settings')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const canManageStaff =
    actorMembership.role === 'OWNER'
    || (actorMembership.role === 'MANAGER' && parsePermissions(actorMembership.permissionsJson).includes('team'))
  if (!canManageStaff) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody<{ permissions?: string[] }>(event)
  if (!Array.isArray(body.permissions)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const target = await prisma.staffMembership.findFirst({
    where: { id, clubId: club.id, active: true },
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  if (target.role === 'OWNER') {
    throw createError({ statusCode: 403, statusMessage: 'Cannot modify owner permissions' })
  }

  if (target.userId === actorMembership.userId && actorMembership.role !== 'OWNER') {
    throw createError({ statusCode: 403, statusMessage: 'Cannot modify your own permissions' })
  }

  const permissions = normalizePermissions(body.permissions)
  if (!permissions.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one permission is required' })
  }

  const invalid = body.permissions.filter((p) => !ALL_OWNER_PERMISSIONS.includes(p as typeof ALL_OWNER_PERMISSIONS[number]))
  if (invalid.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid permission' })
  }

  const updated = await prisma.staffMembership.update({
    where: { id: target.id },
    data: { permissionsJson: JSON.stringify(permissions) },
    include: {
      user: { select: { id: true, name: true, nameEn: true, email: true, phone: true } },
      coach: { select: { id: true, nameFa: true, nameEn: true } },
    },
  })

  return {
    id: updated.id,
    role: updated.role,
    permissions,
    user: updated.user,
    coach: updated.coach,
  }
})
