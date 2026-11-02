import { prisma } from './prisma'

export type CashCorrectionSummary = {
  openCount: number
  applied: boolean
  ok: number
  fail: number
  sample: Array<{ paymentId: string; ownerNet: number; clubId: string | null; coachId: string | null }>
}

/** Append-only clawback of open CASH SettlementLedgerEntry rows (desk never settles). */
export async function correctOpenCashSettlements(opts?: { apply?: boolean }): Promise<CashCorrectionSummary> {
  const apply = opts?.apply === true
  const rows = await prisma.$queryRaw<Array<{
    id: string
    paymentId: string
    clubId: string | null
    coachId: string | null
    ownerNet: number
    bookingId: string | null
  }>>`
    SELECT s.id, s."paymentId", s."clubId", s."coachId", s."ownerNet", s."bookingId"
    FROM "SettlementLedgerEntry" s
    JOIN "Payment" p ON p.id = s."paymentId"
    WHERE p.method = 'CASH'
      AND s."clawedBackAt" IS NULL
    ORDER BY s."createdAt" ASC
  `

  const summary: CashCorrectionSummary = {
    openCount: rows.length,
    applied: apply,
    ok: 0,
    fail: 0,
    sample: rows.slice(0, 20).map((r) => ({
      paymentId: r.paymentId,
      ownerNet: r.ownerNet,
      clubId: r.clubId,
      coachId: r.coachId,
    })),
  }
  if (!apply || !rows.length) return summary

  for (const row of rows) {
    try {
      await prisma.$transaction(async (tx) => {
        const entry = await tx.settlementLedgerEntry.findUnique({ where: { paymentId: row.paymentId } })
        if (!entry || entry.clawedBackAt) return
        await tx.settlementLedgerEntry.update({
          where: { id: entry.id },
          data: { clawedBackAt: new Date() },
        })
        if (entry.ownerNet <= 0) return
        if (entry.coachId) {
          const coach = await tx.coach.findUnique({ where: { id: entry.coachId }, select: { userId: true } })
          if (!coach?.userId) return
          const wallet = await tx.wallet.upsert({
            where: { userId: coach.userId },
            update: {},
            create: { userId: coach.userId },
          })
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { decrement: entry.ownerNet },
              availableBalance: { decrement: entry.ownerNet },
            },
          })
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              amount: -entry.ownerNet,
              type: 'SETTLEMENT_CLAWBACK',
              paymentId: entry.paymentId,
              bookingId: entry.bookingId,
              note: 'Correction: clawback CASH desk settlement',
            },
          })
        }
        else if (entry.clubId) {
          const wallet = await tx.clubWallet.upsert({
            where: { clubId: entry.clubId },
            update: {},
            create: { clubId: entry.clubId },
          })
          await tx.clubWallet.update({
            where: { id: wallet.id },
            data: {
              balance: { decrement: entry.ownerNet },
              availableBalance: { decrement: entry.ownerNet },
            },
          })
          await tx.clubWalletTransaction.create({
            data: {
              walletId: wallet.id,
              amount: -entry.ownerNet,
              type: 'CLAWBACK',
              paymentId: entry.paymentId,
              bookingId: entry.bookingId,
              note: 'Correction: clawback CASH desk settlement',
            },
          })
        }
      })
      summary.ok += 1
    }
    catch (err) {
      console.error('[correctCashSettlements]', row.paymentId, err)
      summary.fail += 1
    }
  }
  return summary
}
