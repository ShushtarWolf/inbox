export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'crm')
  const body = await readBody<{ message?: string; recipient?: string; segmentName?: string; campaignName?: string; schedule?: string }>(event)
  const contacts = await prisma.contact.findMany({ where: { clubId: club.id } })
  const recipientContacts =
    body.recipient === 'vip'
      ? contacts.filter((contact) => contact.totalVisits >= 5)
      : body.recipient === 'inactive'
        ? contacts.filter((contact) => contact.inactiveDays >= 7)
        : body.recipient === 'atRisk'
          ? contacts.filter((contact) => contact.noShowCount >= 1)
          : contacts
  const campaign = await prisma.campaign.create({
    data: {
      clubId: club.id,
      name: body.campaignName || body.segmentName || 'Manual outreach',
      channel: 'SMS',
      template: body.message || '',
      status: body.schedule ? 'SCHEDULED' : 'SENT',
      scheduledAt: body.schedule ? new Date(body.schedule) : null,
      sentAt: body.schedule ? null : new Date(),
    },
  })
  if (recipientContacts.length) {
    await prisma.campaignRecipient.createMany({
      data: recipientContacts.map((contact) => ({
        campaignId: campaign.id,
        contactId: contact.id,
        status: body.schedule ? 'scheduled' : 'delivered',
      })),
    })
  }
  const log = await prisma.smsLog.create({
    data: {
      clubId: club.id,
      message: body.message || '',
      recipient: body.recipient || 'all',
      segmentName: body.segmentName,
      campaignName: campaign.name,
    },
  })
  return { ok: true, log, campaign, note: 'SMS logged only — no gateway in v1' }
})
