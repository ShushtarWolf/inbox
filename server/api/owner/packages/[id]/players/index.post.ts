import { isRecurringReserveEnabled } from '#shared/recurringReserve.ts'

export default defineEventHandler(async (event) => {
  if (!isRecurringReserveEnabled()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'RECURRING_RESERVE_DISABLED',
    })
  }
  const { club } = await requireOwnerClub(event, 'calendar')
  const packageId = getRouterParam(event, 'id')
  const body = await readBody<{ guestName?: string; guestMobile?: string; level?: number }>(event)

  const pkg = await prisma.packageDraft.findFirst({ where: { id: packageId, clubId: club.id } })
  if (!pkg) throw createError({ statusCode: 404, statusMessage: 'Package not found' })

  const [bookingCount, playerCount] = await Promise.all([
    prisma.packageBooking.count({ where: { packageId: pkg.id, status: { not: 'CANCELLED' } } }),
    prisma.packagePlayer.count({ where: { packageId: pkg.id } }),
  ])
  if (bookingCount + playerCount >= pkg.capacity) {
    throw createError({ statusCode: 409, statusMessage: 'Package is full' })
  }

  const guestName = body.guestName?.trim()
  if (!guestName) throw createError({ statusCode: 400, statusMessage: 'guestName required' })

  let athleteId: string | null = null
  const phone = body.guestMobile?.trim()
  if (phone) {
    const athlete = await prisma.user.findFirst({ where: { phone } })
    if (athlete) athleteId = athlete.id
  }

  return prisma.packagePlayer.create({
    data: {
      packageId: pkg.id,
      guestName,
      guestMobile: phone || null,
      level: body.level ?? null,
      athleteId,
    },
  })
})
