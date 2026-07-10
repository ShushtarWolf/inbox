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
    (sum, campaign) => sum + campaign.recipients.filter((recipient) => recipient.status === 'delivered').length,
    0,
  )

  return {
    stats: {
      totalContacts: allContacts.length,
      activeThisMonth: allContacts.filter((contact) => contact.inactiveDays < 30).length,
      smsSent,
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
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      channel: campaign.channel,
      sentAt: campaign.sentAt,
      segmentName: campaign.segment?.name || null,
      delivered: campaign.recipients.filter((recipient) => recipient.status === 'delivered').length,
      total: campaign.recipients.length,
    })),
    reminders,
  }
})
