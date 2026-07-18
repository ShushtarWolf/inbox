import type { Role } from '@prisma/client'

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

  const data: { disabledAt?: Date | null; role?: Role } = {}
  if (typeof body.disabled === 'boolean') {
    data.disabledAt = body.disabled ? new Date() : null
  }
  if (body.role && ['ATHLETE', 'COACH', 'CLUB_ADMIN'].includes(body.role)) {
    data.role = body.role
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
      disabledAt: true,
    },
  })

  return {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    disabled: Boolean(updated.disabledAt),
    disabledAt: updated.disabledAt,
  }
})
