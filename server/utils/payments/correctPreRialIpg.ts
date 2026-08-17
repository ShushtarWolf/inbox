import type { Prisma } from '@prisma/client'
import { splitSettlement } from '#shared/settlement.ts'
import {
  correctedTomanFromPreRialAmount,
  isPreRialIpgPayment,
} from '#shared/preRialIpg.ts'
import { getOrCreateClubWallet } from '../settlement'
import { getOrCreateWallet } from '../wallet'

type DbClient = Prisma.TransactionClient | typeof prisma

export type PreRialIpgCorrection = {
  paymentId: string
  purpose: string
  previousAmount: number
  amountToman: number
  sepAmountRials: number
  clubWalletDelta: number
  athleteWalletDelta: number
  settlementUpdated: boolean
}

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {}
  }
}

async function adjustClubWallet(
  clubId: string,
  delta: number,
  paymentId: string,
  note: string,
  db: Prisma.TransactionClient,
) {
  if (delta === 0) return
  const wallet = await getOrCreateClubWallet(clubId, db)
  await db.clubWallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: delta } },
  })
  await db.clubWalletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: delta,
      type: 'ADJUSTMENT',
      paymentId,
      note,
    },
  })
}

async function adjustAthleteWallet(
  userId: string,
  delta: number,
  paymentId: string,
  note: string,
  db: Prisma.TransactionClient,
) {
  if (delta === 0) return
  const wallet = await getOrCreateWallet(userId, db)
  await db.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: delta } },
  })
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: delta,
      type: 'ADJUSTMENT',
      paymentId,
      note,
    },
  })
}

export async function listPreRialIpgPayments(db: DbClient = prisma) {
  const rows = await db.payment.findMany({
    where: {
      status: 'PAID',
      method: 'IPG',
      provider: 'sep',
    },
    orderBy: { createdAt: 'asc' },
  })
  return rows.filter(isPreRialIpgPayment)
}

async function correctOne(
  paymentId: string,
  db: Prisma.TransactionClient,
): Promise<PreRialIpgCorrection | null> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || !isPreRialIpgPayment(payment)) return null

  const previousAmount = payment.amount
  const amountToman = correctedTomanFromPreRialAmount(previousAmount)
  const sepAmountRials = previousAmount
  const meta = parseMeta(payment.metadataJson)
  let clubWalletDelta = 0
  let athleteWalletDelta = 0
  let settlementUpdated = false

  const ledger = await db.settlementLedgerEntry.findUnique({ where: { paymentId } })
  if (ledger && !ledger.clawedBackAt) {
    const split = splitSettlement(amountToman, ledger.commissionBps)
    clubWalletDelta = split.ownerNet - ledger.ownerNet
    await adjustClubWallet(
      ledger.clubId,
      clubWalletDelta,
      paymentId,
      `Pre-rial IPG correction (bank ${sepAmountRials} rials → ${amountToman} toman)`,
      db,
    )
    await db.settlementLedgerEntry.update({
      where: { id: ledger.id },
      data: {
        gross: split.gross,
        commission: split.commission,
        ownerNet: split.ownerNet,
      },
    })
    settlementUpdated = true
  }

  if (payment.purpose === 'topup' && payment.userId) {
    const credited = await db.walletTransaction.aggregate({
      where: { paymentId, type: 'TOPUP_CREDIT' },
      _sum: { amount: true },
    })
    const already = credited._sum.amount || 0
    athleteWalletDelta = amountToman - already
    await adjustAthleteWallet(
      payment.userId,
      athleteWalletDelta,
      paymentId,
      `Pre-rial IPG top-up correction (bank ${sepAmountRials} rials → ${amountToman} toman)`,
      db,
    )
  }

  await db.payment.update({
    where: { id: payment.id },
    data: {
      amount: amountToman,
      metadataJson: JSON.stringify({
        ...meta,
        preRialIpgCorrected: true,
        preRialIpgCorrectedAt: new Date().toISOString(),
        previousAmount,
        sepAmountRials,
        amountToman,
      }),
    },
  })

  return {
    paymentId: payment.id,
    purpose: payment.purpose,
    previousAmount,
    amountToman,
    sepAmountRials,
    clubWalletDelta,
    athleteWalletDelta,
    settlementUpdated,
  }
}

export async function correctPreRialIpgPayments(opts: { apply: boolean }) {
  const candidates = await listPreRialIpgPayments()
  const preview = candidates.map((payment) => ({
    paymentId: payment.id,
    purpose: payment.purpose,
    previousAmount: payment.amount,
    amountToman: correctedTomanFromPreRialAmount(payment.amount),
    sepAmountRials: payment.amount,
    createdAt: payment.createdAt,
  }))
  if (!opts.apply) {
    return { applied: false as const, count: preview.length, results: preview }
  }

  const results: PreRialIpgCorrection[] = []
  for (const payment of candidates) {
    const row = await prisma.$transaction((tx) => correctOne(payment.id, tx))
    if (row) results.push(row)
  }
  return { applied: true as const, count: results.length, results }
}
