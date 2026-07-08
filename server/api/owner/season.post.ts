export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const body = await readBody<{
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    days?: string[]
    times?: string[]
    comments?: string
  }>(event)

  const record = await prisma.seasonBooking.create({
    data: {
      clubId: club.id,
      guestName: body.guestName || '',
      guestFamily: body.guestFamily || '',
      guestMobile: body.guestMobile || '',
      daysJson: JSON.stringify(body.days || []),
      timesJson: JSON.stringify(body.times || []),
      comments: body.comments,
    },
  })
  return record
})
