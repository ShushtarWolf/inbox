export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 50, 100)

  const payments = await prisma.payment.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      booking: {
        select: {
          id: true,
          status: true,
          user: { select: { id: true, email: true, name: true } },
          slot: {
            select: {
              date: true,
              startTime: true,
              court: {
                select: {
                  nameFa: true,
                  club: { select: { id: true, nameFa: true, slug: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  return {
    payments: payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      provider: payment.provider,
      createdAt: payment.createdAt,
      bookingId: payment.bookingId,
      club: payment.booking?.slot.court.club || null,
      user: payment.booking?.user || null,
      bookingStatus: payment.booking?.status || null,
    })),
  }
})
