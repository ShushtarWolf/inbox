import { createInAppNotification, sendNotification } from '../utils/notify'

export async function notifyWaitlistForFreedSlot(opts: {
  clubId: string
  courtId?: string
  coachId?: string
  date: string
  startTime: string
  endTime: string
}) {
  const entries = await prisma.waitlistEntry.findMany({
    where: {
      clubId: opts.clubId,
      status: 'ACTIVE',
      date: opts.date,
      startTime: opts.startTime,
      ...(opts.courtId ? { courtId: opts.courtId } : {}),
      ...(opts.coachId ? { coachId: opts.coachId } : {}),
    },
    include: { user: true },
    take: 5,
  })

  for (const entry of entries) {
    if (entry.userId) {
      await createInAppNotification({
        userId: entry.userId,
        type: 'WAITLIST_SLOT_AVAILABLE',
        title: 'Slot available',
        body: `A slot opened on ${opts.date} at ${opts.startTime}`,
        metadata: { clubId: opts.clubId, date: opts.date, startTime: opts.startTime },
      })
      if (entry.user?.email) {
        await sendNotification({
          channel: 'email',
          to: entry.user.email,
          template: 'WAITLIST_SLOT_AVAILABLE',
          data: { date: opts.date, startTime: opts.startTime },
        })
      }
      await prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: 'NOTIFIED', notifiedAt: new Date() },
      })
    }
  }
}
