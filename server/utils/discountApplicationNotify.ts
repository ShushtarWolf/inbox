import { clubNotifyName, clubSideNotifyPhones, notifySmsSoft } from './bookingNotify'

type OwnerStudentCardOpts = {
  clubId: string
  clubName: string
  programTitle: string
  athleteName: string
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