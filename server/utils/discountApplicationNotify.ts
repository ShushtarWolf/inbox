import { normalizeIranPhone } from '#shared/phone.ts'
import { clubNotifyName, clubSideNotifyPhones, notifySmsSoft } from './bookingNotify'
import { prisma } from './prisma'

type OwnerStudentCardOpts = {
  clubId: string
  clubName: string
  programTitle: string
  athleteName: string
}

type AthleteDiscountReviewOpts = {
  clubId: string
  clubName: string
  programTitle: string
  discountPercent?: number | null
  verificationKind?: string | null
  athleteUserId: string
  rejectReason?: string | null
}

/** Fail-soft: never throws — discount application is already saved. */
export async function notifyOwnerStudentCardSubmitted(opts: OwnerStudentCardOpts) {
  const phones = await clubSideNotifyPhones(undefined, opts.clubId)
  if (!phones.length) return
  const data: Record<string, unknown> = {
    clubName: clubNotifyName({ nameFa: opts.clubName }),
    programTitle: opts.programTitle,
    athleteName: opts.athleteName,
  }
  for (const phone of phones) {
    await notifySmsSoft(phone, 'OWNER_STUDENT_CARD_SUBMITTED', data, opts.clubId)
  }
}

async function athleteNotifyPhone(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  })
  const mobile = normalizeIranPhone(row?.phone)
  return mobile || null
}

/** Fail-soft: never throws — club review is already persisted. */
export async function notifyAthleteDiscountApproved(opts: AthleteDiscountReviewOpts) {
  const phone = await athleteNotifyPhone(opts.athleteUserId)
  if (!phone) return
  const data: Record<string, unknown> = {
    clubName: clubNotifyName({ nameFa: opts.clubName }),
    programTitle: opts.programTitle,
    discountPercent: opts.discountPercent ?? null,
    verificationKind: opts.verificationKind || '',
  }
  await notifySmsSoft(phone, 'ATHLETE_DISCOUNT_APPROVED', data, opts.clubId)
}

/** Fail-soft: never throws — club review is already persisted. */
export async function notifyAthleteDiscountRejected(opts: AthleteDiscountReviewOpts) {
  const phone = await athleteNotifyPhone(opts.athleteUserId)
  if (!phone) return
  const data: Record<string, unknown> = {
    clubName: clubNotifyName({ nameFa: opts.clubName }),
    programTitle: opts.programTitle,
    verificationKind: opts.verificationKind || '',
    rejectReason: opts.rejectReason?.trim() || '',
  }
  await notifySmsSoft(phone, 'ATHLETE_DISCOUNT_REJECTED', data, opts.clubId)
}