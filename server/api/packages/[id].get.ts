import { isRecurringReserveEnabled } from '#shared/recurringReserve.ts'
import { parseJsonArray } from '../../utils/catalog'

function parseTimesJson(value: string | null | undefined) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export default defineEventHandler(async (event) => {
  if (!isRecurringReserveEnabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const pkg = await prisma.packageDraft.findUnique({
    where: { id },
    include: {
      coach: { select: { id: true, nameFa: true, nameEn: true, photo: true } },
      club: { select: { id: true, slug: true, nameFa: true, nameEn: true, city: true, status: true } },
      bookings: { where: { status: { not: 'CANCELLED' } }, select: { id: true } },
      players: { select: { id: true } },
    },
  })
  if (!pkg || pkg.club.status !== 'ACTIVE') {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }

  const occupied = pkg.bookings.length + pkg.players.length
  const spotsLeft = Math.max(0, pkg.capacity - occupied)
  const { bookings: _bookings, players: _players, ...rest } = pkg
  return {
    ...rest,
    days: parseJsonArray(pkg.daysJson),
    times: parseTimesJson(pkg.timesJson),
    spotsLeft,
    isFull: spotsLeft <= 0,
  }
})
