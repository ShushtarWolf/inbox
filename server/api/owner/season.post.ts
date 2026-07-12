import { generateRecurringCourtSlots } from '../../utils/generateRecurringSlots'
import { equipmentPriceAtBooking } from '../../utils/bookingTotal'
import { expandDayTimeRanges, type DayTimeRange } from '#shared/recurringSessions.ts'

function resolveDayTimes(
  dayTimes?: Record<string, DayTimeRange>,
  times?: string[],
  days?: string[],
): { storedJson: string; expanded: Record<string, string[]> } {
  if (dayTimes && Object.keys(dayTimes).length) {
    const expanded = expandDayTimeRanges(dayTimes)
    return { storedJson: JSON.stringify(dayTimes), expanded }
  }
  if (times?.length && days?.length) {
    const endHour = Number.parseInt(times[times.length - 1].slice(0, 2), 10) + 1
    const legacyRange = { start: times[0], end: `${String(endHour).padStart(2, '0')}:00` }
    const mapped = Object.fromEntries(days.map((day) => [day, legacyRange])) as Record<string, DayTimeRange>
    return { storedJson: JSON.stringify(mapped), expanded: expandDayTimeRanges(mapped) }
  }
  return { storedJson: JSON.stringify(dayTimes || times || []), expanded: {} }
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    days?: string[]
    times?: string[]
    dayTimes?: Record<string, DayTimeRange>
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

  const { storedJson, expanded } = resolveDayTimes(body.dayTimes, body.times, body.days)

  const record = await prisma.seasonBooking.create({
    data: {
      clubId: club.id,
      guestName: body.guestName || '',
      guestFamily: body.guestFamily || '',
      guestMobile: body.guestMobile || '',
      daysJson: JSON.stringify(body.days || []),
      timesJson: storedJson,
      comments: body.comments,
      equipmentId: body.equipmentId || null,
      equipmentPrice,
    },
  })

  let slotsCreated = 0
  const hasSchedule = body.days?.length && Object.keys(expanded).length
  if (body.slotId && hasSchedule) {
    const slot = await prisma.slot.findFirst({
      where: { id: body.slotId, court: { clubId: club.id } },
    })
    if (slot) {
      slotsCreated = await generateRecurringCourtSlots({
        clubId: club.id,
        courtId: slot.courtId,
        anchorDate: slot.date,
        weekdays: body.days!,
        dayTimes: expanded,
        displayStatus: 'RESERVED',
        guestInfo: {
          guestName: body.guestName || '',
          guestFamily: body.guestFamily || '',
          guestMobile: body.guestMobile || '',
          comments: body.comments,
          paymentMethod: (body.paymentMethod as 'IPG' | 'CASH' | undefined) || 'CASH',
          paymentStatus: body.paymentStatus === 'PAID' ? 'PAID' : 'PAY_AT_CLUB',
          equipmentId: body.equipmentId,
          equipmentPrice,
        },
      })
    }
  }

  return { ...record, slotsCreated }
})
