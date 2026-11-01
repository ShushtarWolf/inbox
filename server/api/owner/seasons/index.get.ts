import { formatGuestDisplayName } from '#shared/guestName.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const query = getQuery(event)
  const limitRaw = Number(query.limit)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 50

  const rows = await prisma.seasonBooking.findMany({
    where: { clubId: club.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      guestName: true,
      guestFamily: true,
      guestMobile: true,
      startDate: true,
      finishDate: true,
      daysJson: true,
      timesJson: true,
      comments: true,
      createdAt: true,
    },
  })

  return {
    seasons: rows.map((row) => ({
      id: row.id,
      guestName: formatGuestDisplayName(row.guestName, row.guestFamily),
      guestMobile: row.guestMobile,
      startDate: row.startDate,
      finishDate: row.finishDate,
      daysJson: row.daysJson,
      timesJson: row.timesJson,
      comments: row.comments,
      createdAt: row.createdAt.toISOString(),
    })),
  }
})
