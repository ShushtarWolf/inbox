import { acknowledgeDeskCashReturn } from '../../../../utils/deskCashReturn'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const paymentId = getRouterParam(event, 'id')
  if (!paymentId) throw createError({ statusCode: 400, statusMessage: 'payment id required' })

  const body = await readBody<{ note?: string }>(event).catch(() => ({} as { note?: string }))
  const result = await acknowledgeDeskCashReturn({
    paymentId,
    clubId: club.id,
    note: typeof body?.note === 'string' ? body.note.slice(0, 500) : undefined,
  })
  return result
})
