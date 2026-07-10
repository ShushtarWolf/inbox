export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  const body = await readBody<{ providerRef?: string; status?: string }>(event)
  if (!provider || !body.providerRef) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  // Signature verification placeholder for IPG webhooks
  const payment = await prisma.payment.findFirst({
    where: { provider, providerRef: body.providerRef },
  })
  if (!payment) {
    return { ok: true, skipped: true }
  }

  if (body.status === 'paid' && payment.status !== 'PAID') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID' },
    })
    if (payment.bookingId) {
      await prisma.booking.update({
        where: { id: payment.bookingId },
        data: { paymentStatus: 'PAID', paymentMethod: 'IPG' },
      })
    }
  }

  return { ok: true }
})
