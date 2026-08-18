/** MVP pilot club: دانشگاه علم و صنعت (IUST) tennis courts. */

export const PILOT_CLUB_NAME_FA = 'دانشگاه علم و صنعت'
export const PILOT_CLUB_NAME_EN = 'Iran University of Science and Technology'
export const PILOT_CLUB_SLUG = 'iust-tennis'
export const PILOT_CLUB_CITY = 'تهران'
export const PILOT_CLUB_DISTRICT = 'نارمک'
export const PILOT_CLUB_ADDRESS_FA = 'تهران، نارمک، دانشگاه علم و صنعت ایران'
export const PILOT_CLUB_ADDRESS_EN = 'Narmak, Tehran — Iran University of Science and Technology'
/** IUST main campus (Narmak) — public map pin for club detail. */
export const PILOT_CLUB_LAT = 35.7448
export const PILOT_CLUB_LNG = 51.5049
export const PILOT_OWNER_NAME = 'مدیر مجموعه'
/** Club owner OTP login + public club contact (not Inbox Enamad/footer). */
export const PILOT_OWNER_PHONE = '09153034039'
export const PILOT_CLUB_PHONE = PILOT_OWNER_PHONE
export const PILOT_COURT_COUNT = 3
/** Public list / court price (toman). Low amounts are only for SEP scripts, not MVP catalog. */
export const PILOT_COURT_PRICE = 600_000
export const PILOT_SPORT_SLUG = 'tennis'

/** Leftover pilot row (باشگاه بهناز) must never be treated as the live IUST club. */
export function isRetiredPilotClubName(nameFa?: string | null): boolean {
  return String(nameFa || '').includes('بهناز')
}

export function isOfficialPilotClubName(nameFa?: string | null): boolean {
  return String(nameFa || '').includes('علم و صنعت')
}

/** Live MVP club: iust-tennis / دانشگاه علم و صنعت, never باشگاه بهناز. */
export function isOfficialPilotClub(club: { slug?: string | null; nameFa?: string | null }): boolean {
  if (isRetiredPilotClubName(club.nameFa)) return false
  return club.slug === PILOT_CLUB_SLUG || isOfficialPilotClubName(club.nameFa)
}

/** Prisma `where` for default admin pilot lookup (sync / restore-list-price). */
export function defaultPilotClubWhere() {
  return {
    AND: [
      {
        OR: [
          { slug: PILOT_CLUB_SLUG },
          { nameFa: { contains: 'علم و صنعت' } },
        ],
      },
      { NOT: { nameFa: { contains: 'بهناز' } } },
    ],
  }
}
