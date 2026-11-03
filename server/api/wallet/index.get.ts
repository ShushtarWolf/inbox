import { summarizeAthleteCashDesk } from '#shared/dualRailBooks.ts'
import { refundChannelFromPaymentMetadata, refundChannelI18nKey } from '#shared/refundChannelLabel.ts'
import { totalUserWithdrawable } from '#shared/walletWithdrawRail.ts'
import {
  getAthleteCashOutBalance,
  getWalletBalances,
  getWalletPendingClassBalance,
  getWalletWithdrawableBalance,
  unlockEligibleWalletSettlements,
} from '../../utils/wallet'
import { getUserShebaState, serializeShebaRequest } from '../../utils/shebaChange'
import { resolveShebaRequestUiStatus } from '#shared/shebaApproval.ts'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await unlockEligibleWalletSettlements(user.id)
  const [balances, coachWithdrawable, athleteCashOut, pendingClassBalance, coach] = await Promise.all([
    getWalletBalances(user.id),
    getWalletWithdrawableBalance(user.id),
    getAthleteCashOutBalance(user.id),
    getWalletPendingClassBalance(user.id),
    prisma.coach.findFirst({ where: { userId: user.id }, select: { id: true } }),
  ])
  const isCoach = Boolean(coach)
  const withdrawableBalance = totalUserWithdrawable({
    isCoach,
    coachWithdrawable,
    athleteCashOut,
  })
  const canBankWithdraw = withdrawableBalance > 0 || isCoach || athleteCashOut > 0
  const [wallet, shebaState, pendingWithdraws, recentWithdraws, cashPayments] = await Promise.all([
    prisma.wallet.findUnique({
      where: { userId: user.id },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    }),
    canBankWithdraw ? getUserShebaState(user.id) : Promise.resolve({ sheba: null, pendingRequest: null, lastRejected: null }),
    canBankWithdraw
      ? prisma.userWithdrawRequest.findMany({
          where: { userId: user.id, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : Promise.resolve([]),
    canBankWithdraw
      ? prisma.userWithdrawRequest.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.payment.findMany({
      where: {
        method: 'CASH',
        status: { in: ['PAID', 'REFUNDED'] },
        OR: [
          { booking: { userId: user.id } },
          { coachSession: { athleteId: user.id } },
          { packageBooking: { athleteId: user.id } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
      select: {
        id: true,
        amount: true,
        method: true,
        status: true,
        metadataJson: true,
        booking: {
          select: {
            slot: {
              select: {
                date: true,
                startTime: true,
                court: { select: { nameFa: true, club: { select: { nameFa: true } } } },
              },
            },
          },
        },
        coachSession: {
          select: {
            date: true,
            startTime: true,
            coach: { select: { nameFa: true, club: { select: { nameFa: true } } } },
          },
        },
        packageBooking: {
          select: {
            package: { select: { title: true, club: { select: { nameFa: true } } } },
          },
        },
      },
    }),
  ])

  const shebaUiStatus = canBankWithdraw
    ? resolveShebaRequestUiStatus({
        approvedSheba: shebaState.sheba,
        pendingRequest: shebaState.pendingRequest,
        lastRejected: shebaState.lastRejected,
      })
    : 'none'

  const cashDesk = summarizeAthleteCashDesk(
    cashPayments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      status: p.status,
      metadataJson: p.metadataJson,
      clubName: p.booking?.slot.court.club.nameFa
        || p.coachSession?.coach.club.nameFa
        || p.packageBooking?.package.club.nameFa
        || null,
      date: p.booking?.slot.date || p.coachSession?.date || null,
      startTime: p.booking?.slot.startTime || p.coachSession?.startTime || null,
      title: p.booking?.slot.court.nameFa
        || p.coachSession?.coach.nameFa
        || p.packageBooking?.package.title
        || null,
    })),
  )

  const paymentIds = [...new Set(
    (wallet?.transactions || [])
      .filter((tx) => tx.type === 'REFUND_CREDIT' && tx.paymentId)
      .map((tx) => tx.paymentId as string),
  )]
  const refundMetaByPayment = paymentIds.length
    ? Object.fromEntries(
        (await prisma.payment.findMany({
          where: { id: { in: paymentIds } },
          select: { id: true, metadataJson: true },
        })).map((p) => [p.id, p.metadataJson]),
      )
    : {}

  const transactions = (wallet?.transactions || []).map((tx) => {
    if (tx.type !== 'REFUND_CREDIT' || !tx.paymentId) return tx
    const channel = refundChannelFromPaymentMetadata(refundMetaByPayment[tx.paymentId])
    const refundChannelKey = refundChannelI18nKey(channel)
    return refundChannelKey ? { ...tx, refundChannelKey } : tx
  })

  return {
    balance: balances.availableBalance,
    totalBalance: balances.balance,
    availableBalance: balances.availableBalance,
    lockedBalance: balances.lockedBalance,
    withdrawableBalance: canBankWithdraw ? withdrawableBalance : 0,
    coachWithdrawableBalance: isCoach ? coachWithdrawable : 0,
    athleteCashOutBalance: athleteCashOut,
    pendingClassBalance,
    canBankWithdraw,
    bankWithdrawKind: isCoach ? 'coach' : (canBankWithdraw ? 'athlete' : null),
    dualWithdrawRails: isCoach && coachWithdrawable > 0 && athleteCashOut > 0,
    sheba: canBankWithdraw ? (shebaState.sheba || null) : null,
    shebaUiStatus,
    pendingShebaRequest: canBankWithdraw && shebaState.pendingRequest
      ? serializeShebaRequest(shebaState.pendingRequest)
      : null,
    lastShebaRejection: canBankWithdraw && shebaState.lastRejected
      ? {
          adminNote: shebaState.lastRejected.adminNote,
          reviewedAt: shebaState.lastRejected.reviewedAt?.toISOString() ?? null,
        }
      : null,
    /** Online rail only — spendable closed-loop credit. */
    online: {
      availableBalance: balances.availableBalance,
      lockedBalance: balances.lockedBalance,
    },
    /** Cash rail — accounting only; never spendable in the app wallet. */
    cashDesk,
    transactions,
    pendingWithdraws,
    withdraws: recentWithdraws,
  }
})
