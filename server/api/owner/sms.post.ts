import { sendBulkSms } from '../../utils/sms/service'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'crm')
  const body = await readBody<{ message?: string; recipient?: string; segmentName?: string; campaignName?: string; schedule?: string }>(event)
  const contacts = await prisma.contact.findMany({
    where: { clubId: club.id, consentSms: true },
  })
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

  const smsResult = body.schedule
    ? { sent: false, logged: true }
    : await sendBulkSms({
        recipients: recipientContacts
          .filter((contact) => contact.mobile)
          .map((contact) => ({ phone: contact.mobile, name: contact.name, contactId: contact.id })),
        body: body.message || '',
        clubId: club.id,
        campaignName: campaign.name,
        segmentName: body.segmentName,
      })

  if (recipientContacts.length) {
    await prisma.campaignRecipient.createMany({
      data: recipientContacts.map((contact) => ({
        campaignId: campaign.id,
        contactId: contact.id,
        status: body.schedule ? 'scheduled' : 'logged',
      })),
    })
  }

  return {
    ok: true,
    log: smsResult,
    campaign,
    recipientCount: recipientContacts.length,
    provider: 'log',
    note: 'SMS logged via provider — no live gateway in v1',
  }
})
