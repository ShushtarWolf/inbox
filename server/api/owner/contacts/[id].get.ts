export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'crm')
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing contact id' })
  }
  const contact = await prisma.contact.findFirst({
    where: { id, clubId: club.id },
  })
  if (!contact) {
    throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
  }
  const recipients = await prisma.campaignRecipient.findMany({
    where: { contactId: contact.id },
    include: { campaign: { select: { id: true, name: true, sentAt: true, status: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return {
    contact,
    recentCampaigns: recipients.map((recipient) => ({
      id: recipient.id,
      status: recipient.status,
      createdAt: recipient.createdAt,
      campaign: recipient.campaign,
    })),
  }
})
