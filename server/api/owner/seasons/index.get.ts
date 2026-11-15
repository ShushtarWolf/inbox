import { normalizeIranPhone } from '#shared/phone.ts'
import { resolveSeasonGuestFields } from '#shared/seasonFormHydrate.ts'
import { findUsersByPhones } from '../../../utils/phoneAuth'

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
      cancelledAt: true,
    },
  })

  const usersByPhone = await findUsersByPhones(rows.map((row) => row.guestMobile))

  return {
    seasons: rows.map((row) => {
      const phone = normalizeIranPhone(row.guestMobile)
      const linked = phone ? usersByPhone.get(phone) : undefined
      return {
        id: row.id,
        ...resolveSeasonGuestFields({
          ...row,
          userName: linked?.name,
          userNameFamily: linked?.nameFamily,
        }),
        guestMobile: row.guestMobile,
        startDate: row.startDate,
        finishDate: row.finishDate,
        daysJson: row.daysJson,
        timesJson: row.timesJson,
        comments: row.comments,
        createdAt: row.createdAt.toISOString(),
        status: row.cancelledAt ? 'CANCELLED' as const : 'ACTIVE' as const,
        cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      }
    }),
  }
})
