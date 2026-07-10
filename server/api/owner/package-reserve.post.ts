import { generateRecurringCourtSlots } from '../../utils/generateRecurringSlots'
import { equipmentPriceAtBooking } from '../../utils/bookingTotal'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    coachId?: string
    days?: string[]
    times?: string[]
    comments?: string
    slotId?: string
    equipmentId?: string
    paymentMethod?: string
    paymentStatus?: string
  }>(event)

  let equipmentPrice = 0
  if (body.equipmentId) {
    const equipment = await prisma.equipment.findFirst({
      where: { id: body.equipmentId, clubId: club.id },
    })
    if (equipment) equipmentPrice = equipmentPriceAtBooking(equipment)
  }

  let coachSessionPrice = 0
  if (body.coachId) {
    const coach = await prisma.coach.findFirst({
      where: { id: body.coachId, clubId: club.id },
    })
    if (coach) coachSessionPrice = coach.sessionPrice
  }

  const record = await prisma.seasonBooking.create({
    data: {
      clubId: club.id,
      guestName: body.guestName || '',
      guestFamily: body.guestFamily || '',
      guestMobile: body.guestMobile || '',
      daysJson: JSON.stringify(body.days || []),
      timesJson: JSON.stringify(body.times || []),
      comments: body.comments,
      coachId: body.coachId || null,
      equipmentId: body.equipmentId || null,
      equipmentPrice,
    },
  })

  let slotsCreated = 0
  if (body.slotId && body.days?.length && body.times?.length) {
    const slot = await prisma.slot.findFirst({
      where: { id: body.slotId, court: { clubId: club.id } },
    })
    if (slot) {
      slotsCreated = await generateRecurringCourtSlots({
        clubId: club.id,
        courtId: slot.courtId,
        anchorDate: slot.date,
        weekdays: body.days,
        times: body.times,
        displayStatus: 'TEAM',
        guestInfo: {
          guestName: body.guestName || '',
          guestFamily: body.guestFamily || '',
          guestMobile: body.guestMobile || '',
          comments: body.comments,
          coachId: body.coachId,
          coachSessionPrice,
          equipmentId: body.equipmentId,
          equipmentPrice,
          paymentMethod: (body.paymentMethod as 'IPG' | 'CASH' | undefined) || 'CASH',
          paymentStatus: body.paymentStatus === 'PAID' ? 'PAID' : 'PAY_AT_CLUB',
        },
      })
    }
  }

  return { ...record, slotsCreated }
})
