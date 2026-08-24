import { createInAppNotification } from './notify'

async function safeInApp(opts: Parameters<typeof createInAppNotification>[0]) {
  try {
    await createInAppNotification(opts)
  } catch (err) {
    console.error('[competitionNotify:inApp]', opts.type, opts.userId, err)
  }
}

/** Notify confirmed entrants (and partners) when owner/system cancels a competition. */
export async function notifyCompetitionCancelled(competitionId: string, reason?: string | null) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      club: { select: { nameFa: true, nameEn: true } },
      entries: {
        where: { status: { in: ['CONFIRMED', 'REFUNDED', 'CANCELLED'] } },
        select: { athleteId: true, partnerAthleteId: true },
      },
    },
  })
  if (!competition) return

  const title = 'مسابقه لغو شد'
  const body = reason
    ? `مسابقه «${competition.title}» لغو شد. ${reason} مبلغ پرداختی به کیف پول شما بازگردانده می‌شود.`
    : `مسابقه «${competition.title}» لغو شد. مبلغ پرداختی به کیف پول شما بازگردانده می‌شود.`

  const userIds = new Set<string>()
  for (const entry of competition.entries) {
    userIds.add(entry.athleteId)
    if (entry.partnerAthleteId) userIds.add(entry.partnerAthleteId)
  }

  await Promise.all([...userIds].map((userId) => safeInApp({
    userId,
    type: 'COMPETITION_CANCELLED',
    title,
    body,
    metadata: { competitionId, clubId: competition.clubId, reason: reason ?? null },
  })))
}

/** Notify athlete when their entry is confirmed. */
export async function notifyCompetitionEntryConfirmed(opts: {
  userId: string
  competitionId: string
  title: string
}) {
  await safeInApp({
    userId: opts.userId,
    type: 'COMPETITION_ENTRY_CONFIRMED',
    title: 'ثبت‌نام مسابقه تأیید شد',
    body: `ثبت‌نام شما در «${opts.title}» تأیید شد.`,
    metadata: { competitionId: opts.competitionId },
  })
}
