import type { Prisma } from '@prisma/client'
import { resolveClubCommissionBps } from '#shared/settlement.ts'
import { loadPlatformCommissionBps } from './platformCommission.ts'
import { prisma } from './prisma'

const NOTE_PREFIX = 'Zero-commission refund of prior platform fee'

export type ZeroCommissionClubSummary = {
  clubId: string
  clubName: string
  entryCount: number
  refundToman: number
}

export type ZeroCommissionCorrectionSummary = {
  applied: boolean
  entryCount: number
  clubCount: number
  totalRefundToman: number
  clubs: ZeroCommissionClubSummary[]
  ok: number
  fail: number
  skipped: number
  /** Platform default used to decide which clubs are effectively at 0%. */
  platformCommissionBps: number
  /** Clubs with open fees left alone because their current effective rate is above 0%. */
  excludedClubs: Array<{ clubId: string; clubName: string; effectiveBps: number; entryCount: number }>
}

/** Only clubs whose current effective rate is 0% are owed their prior platform fee back. */
export function isClubEffectivelyZeroCommission(
  clubCommissionBps: number | null | undefined,
  platformCommissionBps: number,
): boolean {
  return resolveClubCommissionBps(clubCommissionBps, platformCommissionBps) === 0
}

async function alreadyRefunded(tx: Prisma.TransactionClient, paymentId: string) {
  const row = await tx.clubWalletTransaction.findFirst({
    where: {
      paymentId,
      type: 'ADJUSTMENT',
      note: { startsWith: NOTE_PREFIX },
    },
    select: { id: true },
  })
  return Boolean(row)
}

/** Refund prior platform fee on open club settlements; zero ledger commission. */
export async function correctZeroPastCommission(opts?: {
  apply?: boolean
}): Promise<ZeroCommissionCorrectionSummary> {
  const apply = opts?.apply === true
  const platformCommissionBps = await loadPlatformCommissionBps(prisma)
  const allEntries = await prisma.settlementLedgerEntry.findMany({
    where: {
      clubId: { not: null },
      clawedBackAt: null,
      commission: { gt: 0 },
    },
    orderBy: [{ clubId: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      paymentId: true,
      clubId: true,
      gross: true,
      commissionBps: true,
      commission: true,
      club: { select: { nameFa: true, commissionBps: true } },
    },
  })

  const excluded = new Map<string, { clubId: string; clubName: string; effectiveBps: number; entryCount: number }>()
  const entries = allEntries.filter((row) => {
    if (!row.clubId) return false
    if (isClubEffectivelyZeroCommission(row.club?.commissionBps, platformCommissionBps)) return true
    const bucket = excluded.get(row.clubId) || {
      clubId: row.clubId,
      clubName: row.club?.nameFa || row.clubId,
      effectiveBps: resolveClubCommissionBps(row.club?.commissionBps, platformCommissionBps),
      entryCount: 0,
    }
    bucket.entryCount += 1
    excluded.set(row.clubId, bucket)
    return false
  })

  const byClub = new Map<string, ZeroCommissionClubSummary>()
  for (const row of entries) {
    const clubId = row.clubId
    if (!clubId) continue
    const bucket = byClub.get(clubId) || {
      clubId,
      clubName: row.club?.nameFa || clubId,
      entryCount: 0,
      refundToman: 0,
    }
    bucket.entryCount += 1
    bucket.refundToman += row.commission
    byClub.set(clubId, bucket)
  }

  const clubs = [...byClub.values()]
  const summary: ZeroCommissionCorrectionSummary = {
    applied: apply,
    entryCount: entries.length,
    clubCount: clubs.length,
    totalRefundToman: clubs.reduce((sum, c) => sum + c.refundToman, 0),
    clubs,
    ok: 0,
    fail: 0,
    skipped: 0,
    platformCommissionBps,
    excludedClubs: [...excluded.values()],
  }
  if (!apply || !entries.length) return summary

  for (const row of entries) {
    if (!row.clubId || row.commission <= 0) {
      summary.skipped += 1
      continue
    }
    try {
      const result = await prisma.$transaction(async (tx) => {
        const ledger = await tx.settlementLedgerEntry.findUnique({ where: { id: row.id } })
        if (!ledger || ledger.clawedBackAt || !ledger.clubId || ledger.commission <= 0) {
          return 'skipped' as const
        }
        if (await alreadyRefunded(tx, ledger.paymentId)) {
          return 'skipped' as const
        }
        // Re-check inside the transaction: an admin may have set a non-zero club rate since the scan.
        const club = await tx.club.findUnique({ where: { id: ledger.clubId }, select: { commissionBps: true } })
        if (!isClubEffectivelyZeroCommission(club?.commissionBps, platformCommissionBps)) {
          return 'skipped' as const
        }

        const refund = ledger.commission
        await tx.settlementLedgerEntry.update({
          where: { id: ledger.id },
          data: {
            commissionBps: 0,
            commission: 0,
            ownerNet: ledger.gross,
          },
        })

        const wallet = await tx.clubWallet.upsert({
          where: { clubId: ledger.clubId },
          update: {},
          create: { clubId: ledger.clubId },
        })
        await tx.clubWallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: refund },
            availableBalance: { increment: refund },
          },
        })
        await tx.clubWalletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: refund,
            type: 'ADJUSTMENT',
            paymentId: ledger.paymentId,
            note: `${NOTE_PREFIX} (${refund} toman @ ${ledger.commissionBps} bps)`,
          },
        })
        return 'ok' as const
      })
      if (result === 'ok') summary.ok += 1
      else summary.skipped += 1
    }
    catch {
      summary.fail += 1
    }
  }

  return summary
}
