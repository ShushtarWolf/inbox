/** Static court photos for دانشگاه علم و صنعت (MVP pilot). Served from public/clubs/iust. */

export type PilotCourtPhoto = {
  url: string
  captionFa: string
  captionEn: string
}

function courtPhotos(court: 1 | 2 | 3): PilotCourtPhoto[] {
  return [1, 2, 3].map((view) => ({
    url: `/clubs/iust/iust-court-${court}-${view}.webp`,
    captionFa: `زمین ${court} — نمای ${view}`,
    captionEn: `Court ${court} — view ${view}`,
  }))
}

export const PILOT_COURT_1_PHOTOS = courtPhotos(1)
export const PILOT_COURT_2_PHOTOS = courtPhotos(2)
export const PILOT_COURT_3_PHOTOS = courtPhotos(3)

export const PILOT_COURT_PHOTOS = {
  1: PILOT_COURT_1_PHOTOS,
  2: PILOT_COURT_2_PHOTOS,
  3: PILOT_COURT_3_PHOTOS,
} as const

export const PILOT_ALL_COURT_PHOTOS: PilotCourtPhoto[] = [
  ...PILOT_COURT_1_PHOTOS,
  ...PILOT_COURT_2_PHOTOS,
  ...PILOT_COURT_3_PHOTOS,
]

export const PILOT_COURT_1_COVER = PILOT_COURT_1_PHOTOS[0]!.url
export const PILOT_COURT_2_COVER = PILOT_COURT_2_PHOTOS[0]!.url
export const PILOT_COURT_3_COVER = PILOT_COURT_3_PHOTOS[0]!.url

export const PILOT_COURT_COVERS = {
  1: PILOT_COURT_1_COVER,
  2: PILOT_COURT_2_COVER,
  3: PILOT_COURT_3_COVER,
} as const

/** @deprecated Use PILOT_* names */
export type BehnazCourtPhoto = PilotCourtPhoto
export const BEHNAZ_COURT_1_PHOTOS = PILOT_COURT_1_PHOTOS
export const BEHNAZ_COURT_2_PHOTOS = PILOT_COURT_2_PHOTOS
export const BEHNAZ_COURT_3_PHOTOS = PILOT_COURT_3_PHOTOS
export const BEHNAZ_COURT_PHOTOS = PILOT_COURT_PHOTOS
export const BEHNAZ_ALL_COURT_PHOTOS = PILOT_ALL_COURT_PHOTOS
export const BEHNAZ_COURT_1_COVER = PILOT_COURT_1_COVER
export const BEHNAZ_COURT_2_COVER = PILOT_COURT_2_COVER
export const BEHNAZ_COURT_3_COVER = PILOT_COURT_3_COVER
export const BEHNAZ_COURT_COVERS = PILOT_COURT_COVERS
