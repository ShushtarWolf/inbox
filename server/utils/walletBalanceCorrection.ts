import type { Prisma, PrismaClient } from '@prisma/client'
import { auditWalletBalance, type WalletAuditInput } from '#shared/walletBalanceAudit.ts'
import { alignClubCachedBalance } from './settlement'
import { alignAthleteCachedBalance } from './wallet'

type Db = Prisma.TransactionClient | PrismaClient

export function semanticGapNote(walletId: string) {
  return `balance-semantic-gap:${walletId}`
}

async function athleteInput(db: Db, walletId: string): Promise<WalletAuditInput | null> {
  const wallet = await db.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) return null
  const [txs, paid] = await Promise.all([
    db.walletTransaction.findMany({ where: { walletId }, select: { type: true, amount: true } }),
    db.userWithdrawRequest.aggregate({ where: { userId: wallet.userId, status: 'PAID' }, _sum: { amount: true } }),
  ])
  return {
    walletId,
    kind: 'athlete',
    ownerId: wallet.userId,
    storedBalance: wallet.balance,
    availableBalance: wallet.availableBalance,
    lockedBalance: wallet.lockedBalance,
    txs,
    withdrawPaidToman: paid._sum.amount || 0,
  }
}

async function clubInput(db: Db, walletId: string): Promise<WalletAuditInput | null> {
  const wallet = await db.clubWallet.findUnique({ where: { id: walletId } })
  if (!wallet) return null
  const [txs, paid] = await Promise.all([
    db.clubWalletTransaction.findMany({ where: { walletId }, select: { type: true, amount: true } }),
    db.withdrawRequest.aggregate({ where: { clubId: wallet.clubId, status: 'PAID' }, _sum: { amount: true } }),
  ])
  return {
    walletId,
    kind: 'club',
    ownerId: wallet.clubId,
    storedBalance: wallet.balance,
    availableBalance: wallet.availableBalance,
    lockedBalance: wallet.lockedBalance,
    txs,
    withdrawPaidToman: paid._sum.amount || 0,
  }
}

export async function loadWalletAudit(db: Db, kind: 'athlete' | 'club', walletId: string) {
  const input = kind === 'athlete' ? await athleteInput(db, walletId) : await clubInput(db, walletId)
  if (!input) return null
  return auditWalletBalance(input)
}

/**
 * Append one ADJUSTMENT so the stored balance matches the semantic ledger.
 * Refuses a stale or unapproved delta. Does not rewrite older rows.
 */
export async function applyApprovedBalanceGap(
  db: PrismaClient,
  approved: { kind: 'athlete' | 'club', walletId: string, appendAmount: number },
) {
  const note = semanticGapNote(approved.walletId)
  return db.$transaction(async (tx) => {
    if (approved.kind === 'athlete') {
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${approved.walletId} FOR UPDATE`
      const existing = await tx.walletTransaction.findFirst({ where: { walletId: approved.walletId, note } })
      if (existing) return { applied: false as const, reason: 'already_adjusted' as const }
      const audit = await loadWalletAudit(tx, 'athlete', approved.walletId)
      if (!audit?.proposal || audit.proposal.appendAmount !== approved.appendAmount) {
        return { applied: false as const, reason: 'stale_or_not_correctable' as const }
      }
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: approved.walletId } })
      await alignAthleteCachedBalance(wallet.userId, approved.appendAmount, note, tx)
      return { applied: true as const, amount: approved.appendAmount }
    }
    await tx.$queryRaw`SELECT id FROM "ClubWallet" WHERE id = ${approved.walletId} FOR UPDATE`
    const existing = await tx.clubWalletTransaction.findFirst({ where: { walletId: approved.walletId, note } })
    if (existing) return { applied: false as const, reason: 'already_adjusted' as const }
    const audit = await loadWalletAudit(tx, 'club', approved.walletId)
    if (!audit?.proposal || audit.proposal.appendAmount !== approved.appendAmount) {
      return { applied: false as const, reason: 'stale_or_not_correctable' as const }
    }
    const wallet = await tx.clubWallet.findUniqueOrThrow({ where: { id: approved.walletId } })
    await alignClubCachedBalance(wallet.clubId, approved.appendAmount, note, tx)
    return { applied: true as const, amount: approved.appendAmount }
  })
}
