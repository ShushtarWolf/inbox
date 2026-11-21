import { normalizeIranPhone } from '#shared/phone.ts'
import { resolveSeasonGuestFields } from '#shared/seasonFormHydrate.ts'
import {
  ownerSeasonListOrderBy,
  parseOwnerSeasonListLimit,
} from '#shared/ownerSeasonList.ts'
import { findUsersByPhones } from '../../../utils/phoneAuth'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const query = getQuery(event)
  const limit = parseOwnerSeasonListLimit(query.limit)
  const guestQuery = typeof query.q === 'string' ? query.q.trim() : ''

  const where = {
    clubId: club.id,
    ...(guestQuery
      ? {
          OR: [
            { guestName: { contains: guestQuery } },
            { guestFamily: { contains: guestQuery } },
            { guestMobile: { contains: guestQuery } },
            { comments: { contains: guestQuery } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.seasonBooking.count({ where }),
    prisma.seasonBooking.findMany({
    where,
    orderBy: ownerSeasonListOrderBy,
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
  }),
  ])

  const usersByPhone = await findUsersByPhones(rows.map((row) => row.guestMobile))

  return {
    total,
    limit,
    truncated: total > rows.length,
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
