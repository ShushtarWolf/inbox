import type { Prisma } from '@prisma/client'

/** Persian message shown to admin when deletion is blocked (HTTP 409). */
export const CLUB_DELETE_BLOCKED_MESSAGE =
  'حذف این باشگاه ممکن نیست؛ رزرو، پرداخت یا سابقه مالی ثبت شده است.'

export type ClubDeletionBlocker =
  | 'booking'
  | 'season_booking'
  | 'coach_session'
  | 'payment'
  | 'settlement'
  | 'withdraw'
  | 'wallet_transaction'
  | 'wallet_balance'
  | 'competition_entry'
  | 'package_booking'

type Db = Pick<Prisma.TransactionClient, 'booking' | 'seasonBooking' | 'coachSession' | 'payment' | 'settlementLedgerEntry' | 'withdrawRequest' | 'clubWallet' | 'clubWalletTransaction' | 'competitionEntry' | 'packageBooking'>

function clubPaidPaymentWhere(clubId: string): Prisma.PaymentWhereInput {
  return {
    OR: [
      { booking: { is: { slot: { court: { clubId } } } } },
      { coachSession: { is: { coach: { clubId } } } },
      { packageBooking: { is: { package: { clubId } } } },
      { competitionEntry: { is: { competition: { clubId } } } },
    ],
  }
}

/** Returns the first blocker category, or null when the club may be deleted safely. */
export async function assessClubDeletionBlockers(db: Db, clubId: string): Promise<ClubDeletionBlocker | null> {
  const wallet = await db.clubWallet.findUnique({ where: { clubId } })

  const [
    bookingCount,
    seasonBookingCount,
    coachSessionCount,
    paymentCount,
    settlementCount,
    withdrawCount,
    walletTxCount,
    competitionEntryCount,
    packageBookingCount,
  ] = await Promise.all([
    db.booking.count({ where: { slot: { court: { clubId } } } }),
    db.seasonBooking.count({ where: { clubId } }),
    db.coachSession.count({ where: { coach: { clubId } } }),
    db.payment.count({ where: clubPaidPaymentWhere(clubId) }),
    db.settlementLedgerEntry.count({ where: { clubId } }),
    db.withdrawRequest.count({ where: { clubId } }),
    wallet
      ? db.clubWalletTransaction.count({ where: { walletId: wallet.id } })
      : Promise.resolve(0),
    db.competitionEntry.count({ where: { competition: { clubId } } }),
    db.packageBooking.count({ where: { package: { clubId } } }),
  ])

  if (bookingCount > 0) return 'booking'
  if (seasonBookingCount > 0) return 'season_booking'
  if (coachSessionCount > 0) return 'coach_session'
  if (paymentCount > 0) return 'payment'
  if (settlementCount > 0) return 'settlement'
  if (withdrawCount > 0) return 'withdraw'
  if (walletTxCount > 0) return 'wallet_transaction'
  if (wallet && (wallet.balance !== 0 || wallet.availableBalance !== 0 || wallet.lockedBalance !== 0)) {
    return 'wallet_balance'
  }
  if (competitionEntryCount > 0) return 'competition_entry'
  if (packageBookingCount > 0) return 'package_booking'

  return null
}

/**
 * Deletes a club with no booking or financial history. Caller must run guards first.
 * Clears coach club links (SetNull) and removes an empty club wallet before club delete.
 */
export async function deleteClubWithDependents(tx: Prisma.TransactionClient, clubId: string) {
  const wallet = await tx.clubWallet.findUnique({ where: { clubId } })
  if (wallet) {
    await tx.clubWalletTransaction.deleteMany({ where: { walletId: wallet.id } })
    await tx.clubWallet.delete({ where: { id: wallet.id } })
  }

  await tx.coach.updateMany({
    where: { clubId },
    data: { clubId: null },
  })

  await tx.club.delete({ where: { id: clubId } })
}