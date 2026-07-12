import type { DayTimeRange } from '#shared/recurringSessions.ts'
import { defaultPermissionsForRole, normalizePermissions, parsePermissions } from '#shared/ownerPermissions.ts'
import {
  ensureWorkerLogin,
  mapWorkerRecord,
  normalizeWorkerRole,
  parseWorkingHours,
  serializeWorkingHours,
} from '~/server/utils/workers'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'team')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const existing = await prisma.clubWorker.findFirst({
    where: { id, clubId: club.id, active: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody<{
    firstName?: string
    lastName?: string
    mobile?: string
    emergencyMobile?: string | null
    email?: string | null
    role?: string
    permissions?: string[]
    workingHours?: Record<string, DayTimeRange>
  }>(event)

  const firstName = body.firstName?.trim() || existing.firstName
  const lastName = body.lastName?.trim() || existing.lastName
  const mobile = body.mobile?.trim() || existing.mobile
  const role = body.role ? normalizeWorkerRole(body.role) : existing.role
  const permissions = body.permissions?.length
    ? normalizePermissions(body.permissions)
    : existing.permissionsJson
      ? normalizePermissions(parsePermissions(existing.permissionsJson))
      : defaultPermissionsForRole(role)
  const workingHours = body.workingHours
    ? parseWorkingHours(JSON.stringify(body.workingHours))
    : parseWorkingHours(existing.workingHoursJson)
  const email = body.email !== undefined ? (body.email?.trim().toLowerCase() || null) : existing.email

  let membershipId = existing.membershipId
  let temporaryPassword: string | undefined

  if (email) {
    const login = await ensureWorkerLogin({
      clubId: club.id,
      email,
      firstName,
      lastName,
      mobile,
      role,
      permissions,
    })
    membershipId = login.membershipId
    temporaryPassword = login.temporaryPassword
  } else if (membershipId) {
    await prisma.staffMembership.update({
      where: { id: membershipId },
      data: {
        role,
        permissionsJson: JSON.stringify(permissions),
        active: true,
      },
    })
  }

  const worker = await prisma.clubWorker.update({
    where: { id },
    data: {
      firstName,
      lastName,
      mobile,
      emergencyMobile: body.emergencyMobile !== undefined
        ? (body.emergencyMobile?.trim() || null)
        : existing.emergencyMobile,
      email,
      role,
      workingHoursJson: serializeWorkingHours(workingHours),
      permissionsJson: JSON.stringify(permissions),
      membershipId,
    },
  })

  return { ...mapWorkerRecord(worker), temporaryPassword }
})
