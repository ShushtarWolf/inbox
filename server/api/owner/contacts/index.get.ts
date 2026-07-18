import { resolveSmsProvider } from '#shared/sms.ts'

function isSentStatus(status: string) {
  return status === 'sent'
}

function isLoggedStatus(status: string) {
  return status === 'logged' || status === 'delivered'
}

function isQueuedStatus(status: string) {
  return status === 'queued-for-gateway'
}

function isOutreachStatus(status: string) {
  return isSentStatus(status) || isLoggedStatus(status) || isQueuedStatus(status)
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'crm')
  const query = getQuery(event)
  const segment = query.segment as string | undefined
  const contacts = await prisma.contact.findMany({
    where: {
      clubId: club.id,
      ...(segment === 'vip' ? { totalVisits: { gte: 5 } } : {}),
      ...(segment === 'inactive' ? { inactiveDays: { gte: 7 } } : {}),
      ...(segment === 'atRisk' ? { noShowCount: { gte: 1 } } : {}),
    },
    orderBy: [{ totalVisits: 'desc' }, { createdAt: 'desc' }],
  })
  const segments = await prisma.contactSegment.findMany({
    where: { clubId: club.id },
    orderBy: { createdAt: 'asc' },
  })
  const campaigns = await prisma.campaign.findMany({
    where: { clubId: club.id },
    include: { recipients: true, segment: true },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })
  const reminders = await prisma.reminderRule.findMany({
    where: { clubId: club.id, active: true },
    orderBy: { createdAt: 'asc' },
  })
  const allContacts = await prisma.contact.findMany({ where: { clubId: club.id } })
  const allCampaigns = await prisma.campaign.findMany({ where: { clubId: club.id }, include: { recipients: true } })
  const smsSent = allCampaigns.reduce(
    (sum, campaign) => sum + campaign.recipients.filter((recipient) => isSentStatus(recipient.status)).length,
    0,
  )
  const smsLogged = allCampaigns.reduce(
    (sum, campaign) => sum + campaign.recipients.filter((recipient) => isLoggedStatus(recipient.status)).length,
    0,
  )
  const smsQueued = allCampaigns.reduce(
    (sum, campaign) => sum + campaign.recipients.filter((recipient) => isQueuedStatus(recipient.status)).length,
    0,
  )
  const provider = resolveSmsProvider()
  const live = provider === 'live'

  return {
    sms: {
      resolvedProvider: provider,
      live,
    },
    stats: {
      totalContacts: allContacts.length,
      activeThisMonth: allContacts.filter((contact) => contact.inactiveDays < 30).length,
      // Card value follows effective mode: live shows sent/queued only; log shows dry-run logged volume.
      smsSent: live ? smsSent + smsQueued : smsLogged + smsSent + smsQueued,
      smsLogged,
      smsQueued,
      campaigns: allCampaigns.length,
    },
    contacts,
    segments: [
      { id: 'all', name: 'All contacts', count: contacts.length },
      { id: 'vip', name: 'VIP', count: contacts.filter((contact) => contact.totalVisits >= 5).length },
      { id: 'inactive', name: 'Needs reactivation', count: contacts.filter((contact) => contact.inactiveDays >= 7).length },
      { id: 'atRisk', name: 'No-show risk', count: contacts.filter((contact) => contact.noShowCount >= 1).length },
      ...segments.map((segmentItem) => ({
        id: segmentItem.id,
        name: segmentItem.name,
        count: contacts.length,
      })),
    ],
    campaigns: campaigns.map((campaign) => {
      const sent = campaign.recipients.filter((recipient) => isSentStatus(recipient.status)).length
      const logged = campaign.recipients.filter((recipient) => isLoggedStatus(recipient.status)).length
      const queued = campaign.recipients.filter((recipient) => isQueuedStatus(recipient.status)).length
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        channel: campaign.channel,
        sentAt: campaign.sentAt,
        segmentName: campaign.segment?.name || null,
        sent,
        queued,
        // Keep `delivered` as a non-delivery outreach count for older UI; never imply phone delivery.
        delivered: campaign.recipients.filter((recipient) => isOutreachStatus(recipient.status)).length,
        logged,
        total: campaign.recipients.length,
      }
    }),
    reminders,
  }
})
