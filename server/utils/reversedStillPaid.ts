import { prisma } from './prisma'

/** Payment ids that are PAID with gatewayReversed — must not count toward bank withdraw. */
export async function paymentIdsBlockedForWithdraw(
  paymentIds: string[],
  db: { payment: { findMany: typeof prisma.payment.findMany } } = prisma,
): Promise<Set<string>> {
  if (!paymentIds.length) return new Set()
  const rows = await db.payment.findMany({
    where: {
      id: { in: paymentIds },
      status: 'PAID',
      metadataJson: { contains: '"gatewayReversed":true' },
    },
    select: { id: true },
  })
  return new Set(rows.map((r) => r.id))
}
