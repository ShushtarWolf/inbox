import { randomBytes } from 'node:crypto'
import type { StaffRole } from '@prisma/client'
import { defaultPermissionsForRole, normalizePermissions } from '#shared/ownerPermissions.ts'

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

  let user = await prisma.user.findUnique({ where: { email } })
  const tempPassword = randomBytes(12).toString('base64url')
  let createdPassword: string | undefined

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        nameEn: name,
        role: role === 'COACH' ? 'COACH' : 'CLUB_ADMIN',
        passwordHash: hashSecret(tempPassword),
      },
    })
    createdPassword = tempPassword
    if (role === 'COACH') {
      const sport = await prisma.sport.findFirstOrThrow({ where: { slug: 'padel' } })
      await prisma.coach.create({
        data: { nameFa: name, nameEn: name, city: club.city, sportId: sport.id, clubId: club.id, userId: user.id },
      })
    }
  }

  const coach = role === 'COACH'
    ? await prisma.coach.findFirst({ where: { userId: user.id, clubId: club.id } })
    : null

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
