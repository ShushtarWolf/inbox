/** Static court photos for باشگاه بهناز (pilot). Served from public/demo/clubs. */

export type BehnazCourtPhoto = {
  url: string
  captionFa: string
  captionEn: string
}

function courtPhotos(court: 1 | 2 | 3): BehnazCourtPhoto[] {
  return [1, 2, 3].map((view) => ({
    url: `/demo/clubs/behnaz-court-${court}-${view}.webp`,
    captionFa: `زمین ${court} — نمای ${view}`,
    captionEn: `Court ${court} — view ${view}`,
  }))
}

export const BEHNAZ_COURT_1_PHOTOS = courtPhotos(1)
export const BEHNAZ_COURT_2_PHOTOS = courtPhotos(2)
export const BEHNAZ_COURT_3_PHOTOS = courtPhotos(3)

export const BEHNAZ_COURT_PHOTOS = {
  1: BEHNAZ_COURT_1_PHOTOS,
  2: BEHNAZ_COURT_2_PHOTOS,
  3: BEHNAZ_COURT_3_PHOTOS,
} as const

export const BEHNAZ_ALL_COURT_PHOTOS: BehnazCourtPhoto[] = [
  ...BEHNAZ_COURT_1_PHOTOS,
  ...BEHNAZ_COURT_2_PHOTOS,
  ...BEHNAZ_COURT_3_PHOTOS,
]

export const BEHNAZ_COURT_1_COVER = BEHNAZ_COURT_1_PHOTOS[0]!.url
export const BEHNAZ_COURT_2_COVER = BEHNAZ_COURT_2_PHOTOS[0]!.url
export const BEHNAZ_COURT_3_COVER = BEHNAZ_COURT_3_PHOTOS[0]!.url

export const BEHNAZ_COURT_COVERS = {
  1: BEHNAZ_COURT_1_COVER,
  2: BEHNAZ_COURT_2_COVER,
  3: BEHNAZ_COURT_3_COVER,
} as const
