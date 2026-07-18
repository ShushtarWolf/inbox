import { resolveSmsProvider, recipientStatusForSmsResult, SMS_RECIPIENT_STATUS } from '#shared/sms.ts'
import { sendBulkSms } from '../../utils/sms/service'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'owner:sms')
  const { club } = await requireOwnerClub(event, 'crm')
  const body = await readBody<{
    message?: string
    recipient?: string
    segmentName?: string
    campaignName?: string
    schedule?: string
  }>(event)

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

  const provider = resolveSmsProvider()
  const live = provider === 'live'
  const message = body.message || ''
  const campaignName = body.campaignName || body.segmentName || 'Manual outreach'
  const scheduledAt = body.schedule ? new Date(body.schedule) : null

  if (scheduledAt) {
    const campaign = await prisma.campaign.create({
      data: {
        clubId: club.id,
        name: campaignName,
        channel: 'SMS',
        template: message,
        status: 'SCHEDULED',
        scheduledAt,
        sentAt: null,
      },
    })

    if (recipientContacts.length) {
      await prisma.campaignRecipient.createMany({
        data: recipientContacts.map((contact) => ({
          campaignId: campaign.id,
          contactId: contact.id,
          status: SMS_RECIPIENT_STATUS.scheduled,
        })),
      })
    }

    return {
      ok: true,
      log: { sent: false, logged: false },
      campaign,
      recipientCount: recipientContacts.length,
      provider,
      note: 'Campaign scheduled — not sent yet. Process due rows via POST /api/admin/sms/process-scheduled',
    }
  }

  // Create as DRAFT until the SMS pipeline succeeds — never claim SENT on failure.
  const campaign = await prisma.campaign.create({
    data: {
      clubId: club.id,
      name: campaignName,
      channel: 'SMS',
      template: message,
      status: 'DRAFT',
      sentAt: null,
    },
  })

  const smsResult = await sendBulkSms({
    recipients: recipientContacts
      .filter((contact) => contact.mobile)
      .map((contact) => ({ phone: contact.mobile, name: contact.name, contactId: contact.id })),
    body: message,
    clubId: club.id,
    campaignName: campaign.name,
    segmentName: body.segmentName,
  })

  if (!smsResult.sent && !smsResult.logged) {
    throw createError({
      statusCode: 502,
      statusMessage: 'SMS provider did not accept the campaign',
    })
  }

  const recipientStatus = recipientStatusForSmsResult(smsResult)
  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'SENT', sentAt: new Date() },
  })

  if (recipientContacts.length) {
    await prisma.campaignRecipient.createMany({
      data: recipientContacts.map((contact) => ({
        campaignId: campaign.id,
        contactId: contact.id,
        status: recipientStatus,
      })),
    })
  }

  return {
    ok: true,
    log: smsResult,
    campaign: updated,
    recipientCount: recipientContacts.length,
    provider,
    note: live
      ? 'SMS sent via live Kavenegar gateway'
      : 'SMS dry-run logged — set SMS_ENABLED=true, SMS_PROVIDER=live, KAVENEGAR_API_KEY, and a valid KAVENEGAR_SENDER (and/or KAVENEGAR_TEMPLATE for OTP) for live CRM sends',
  }
})
