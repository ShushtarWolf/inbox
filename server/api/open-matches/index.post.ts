import { createOpenMatch } from '../../utils/openMatches'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    slotId?: string
    paymentMode?: 'HOST_PAYS' | 'SPLIT_ONLINE'
    matchType?: 'FRIENDLY' | 'COMPETITIVE'
    maxPlayers?: number
    minPlayers?: number
    minLevel?: number | null
    maxLevel?: number | null
    note?: string | null
    bookingId?: string | null
  }>(event)

  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })
  if (body.paymentMode !== 'HOST_PAYS' && body.paymentMode !== 'SPLIT_ONLINE') {
    throw createError({ statusCode: 400, statusMessage: 'paymentMode required' })
  }

  return createOpenMatch({
    hostUserId: user.id,
    slotId: body.slotId,
    paymentMode: body.paymentMode,
    matchType: body.matchType === 'COMPETITIVE' ? 'COMPETITIVE' : 'FRIENDLY',
    maxPlayers: body.maxPlayers,
    minPlayers: body.minPlayers,
    minLevel: body.minLevel,
    maxLevel: body.maxLevel,
    note: body.note,
    bookingId: body.bookingId,
  })
})