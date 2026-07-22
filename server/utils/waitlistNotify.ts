import { resolveSmsProvider } from '#shared/sms.ts'
import { createInAppNotification, sendNotification } from './notify'
import { prisma } from './prisma'

/**
 * Notify ACTIVE waitlist entries when a court/coach slot is freed.
 * Soft-fail entirely — cancel/book HTTP handlers must never 500 after DB success.
 *
 * Court frees match entries for this court OR any-court (courtId null), excluding coach-specific rows.
 * Coach frees (if called) match this coach OR any-coach (coachId null), excluding court-specific rows.
 */
export async function notifyWaitlistForFreedSlot(opts: {
  clubId: string
  courtId?: string
  coachId?: string
  date: string
  startTime: string
  endTime: string
}) {
  try {
    await notifyWaitlistForFreedSlotInner(opts)
  } catch (err) {
    console.error('[waitlistNotify]', err)
  }
}

async function notifyWaitlistForFreedSlotInner(opts: {
  clubId: string
  courtId?: string
  coachId?: string
  date: string
  startTime: string
  endTime: string
}) {
  const club = await prisma.club.findUnique({ where: { id: opts.clubId } })
  const clubName = club?.nameFa || club?.nameEn || ''

  const courtMatch = opts.courtId
    ? {
        coachId: null as string | null,
        OR: [{ courtId: null }, { courtId: opts.courtId }],
      }
    : undefined
  const coachMatch = !opts.courtId && opts.coachId
    ? {
        courtId: null as string | null,
        OR: [{ coachId: null }, { coachId: opts.coachId }],
      }
    : undefined

  if (!courtMatch && !coachMatch) {
    console.log('[waitlistNotify:skip]', 'no courtId/coachId', opts.clubId, opts.date, opts.startTime)
    return
  }

  const entries = await prisma.waitlistEntry.findMany({
    where: {
      clubId: opts.clubId,
      status: 'ACTIVE',
      date: opts.date,
      startTime: opts.startTime,
      ...(courtMatch || coachMatch),
    },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
    take: 5,
  })

  const data = {
    clubName,
    date: opts.date,
    startTime: opts.startTime,
    time: opts.startTime,
  }

  for (const entry of entries) {
    try {
      const phone = entry.user?.phone || entry.guestMobile || null
      const email = entry.user?.email || null
      let notified = false

      if (entry.userId) {
        try {
          await createInAppNotification({
            userId: entry.userId,
            type: 'WAITLIST_SLOT_AVAILABLE',
            title: 'Slot available',
            body: `A slot opened at ${clubName || 'club'} — ${opts.date} ${opts.startTime}`,
            metadata: {
              clubId: opts.clubId,
              courtId: opts.courtId,
              date: opts.date,
              startTime: opts.startTime,
            },
          })
          notified = true
        } catch (err) {
          console.error('[waitlistNotify:in_app]', err)
        }
      }

      if (email) {
        try {
          await sendNotification({
            channel: 'email',
            to: email,
            template: 'WAITLIST_SLOT_AVAILABLE',
            data,
          })
          notified = true
        } catch (err) {
          console.error('[waitlistNotify:email]', err)
        }
      }

      if (phone) {
        if (resolveSmsProvider() !== 'live') {
          console.log('[waitlistNotify:sms:skip]', 'WAITLIST_SLOT_AVAILABLE', phone)
          notified = true
        } else {
          try {
            await sendNotification({
              channel: 'sms',
              to: phone,
              template: 'WAITLIST_SLOT_AVAILABLE',
              data,
              clubId: opts.clubId,
            })
            notified = true
          } catch (err) {
            console.error('[waitlistNotify:sms]', err)
          }
        }
      }

      if (notified) {
        await prisma.waitlistEntry.update({
          where: { id: entry.id },
          data: { status: 'NOTIFIED', notifiedAt: new Date() },
        })
      }
    } catch (err) {
      console.error('[waitlistNotify:entry]', entry.id, err)
    }
  }
}
