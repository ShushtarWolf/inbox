import { assertPackagesEnabled } from '../../utils/packagesGate'
import { bookPackageSeat, expandPackageSessions } from '../../utils/packages'
import {
  clubNotifyLocation,
  clubNotifyName,
  courtNotifyName,
  notifyBookingConfirmed,
  notifyOwnerBookingConfirmed,
  ownerNotifyPhone,
  personNotifyName,
} from '../../utils/bookingNotify'
import { requireOnlinePaymentsForAthlete } from '../../utils/requireOnlinePayments'

export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const user = await requireUser(event)
  requireOnlinePaymentsForAthlete()
  const body = await readBody<{ packageId?: string; days?: string[]; times?: string[] }>(event)
  if (!body.packageId) {
    throw createError({ statusCode: 400, statusMessage: 'packageId required' })
  }

  const booking = await bookPackageSeat({
    packageId: body.packageId,
    athleteId: user.id,
    days: body.days,
    times: body.times,
  })

  const pkg = await prisma.packageDraft.findUnique({
    where: { id: body.packageId },
    include: {
      club: { include: { owner: { select: { phone: true } } } },
      court: true,
    },
  })
  const athlete = await prisma.user.findUnique({ where: { id: user.id } })
  if (pkg) {
    const days = body.days?.length
      ? body.days
      : (pkg.daysJson ? (JSON.parse(pkg.daysJson) as string[]) : [])
    const duration = pkg.club.defaultSessionDurationMinutes || 60
    const sessions = (pkg.startDate && pkg.finishDate)
      ? expandPackageSessions({
          startDate: pkg.startDate,
          finishDate: pkg.finishDate,
          days,
          timesJson: body.times?.length ? JSON.stringify(body.times) : pkg.timesJson,
          daysJson: pkg.daysJson,
        }, duration)
      : []
    const first = sessions[0]
    const last = sessions[sessions.length - 1]
    const courtLabel = pkg.court ? courtNotifyName(pkg.court) : ''
    const guestName = personNotifyName(athlete?.name)

    await notifyBookingConfirmed({
      userId: user.id,
      email: athlete?.email,
      phone: athlete?.phone,
      kind: 'package',
      clubName: clubNotifyName(pkg.club),
      clubId: pkg.clubId,
      bookingId: booking.id,
      packageName: pkg.title,
      courtName: courtLabel,
      courtNumber: courtLabel,
      date: pkg.startDate || '',
      finishDate: pkg.finishDate || '',
      startTime: first?.startTime || '',
      endTime: first?.endTime || last?.endTime || '',
      sessionCount: sessions.length || null,
      sessions: sessions.map((s) => ({
        courtName: courtLabel || pkg.title,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      paymentPaid: false,
      guestName,
      // Package seats use athlete bookings dashboard, not court receipt tokens.
      receiptUrl: '',
      ...clubNotifyLocation(pkg.club),
    })
    await notifyOwnerBookingConfirmed({
      ownerPhone: ownerNotifyPhone(pkg.club),
      clubName: clubNotifyName(pkg.club),
      clubId: pkg.clubId,
      bookingId: booking.id,
      guestName,
      guestPhone: athlete?.phone,
      sessions: sessions.length
        ? sessions.slice(0, 8).map((s) => ({
            courtName: courtLabel || pkg.title,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
          }))
        : [{
            courtName: courtLabel || pkg.title,
            date: pkg.startDate || '',
            startTime: first?.startTime || '',
            endTime: first?.endTime || '',
          }],
    })
  }

  return booking
})
