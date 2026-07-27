import {
  BEHNAZ_ALL_COURT_PHOTOS,
  BEHNAZ_COURT_1_COVER,
  BEHNAZ_COURT_COVERS,
} from '#shared/behnazClubPhotos.ts'

type Db = typeof prisma

function findCourt(
  courts: Array<{ id: string; nameEn: string; nameFa: string }>,
  n: 1 | 2 | 3,
) {
  return (
    courts.find((c) => c.nameEn === `Court ${n}` || c.nameFa === `زمین ${n}`)
    || null
  )
}

/** Attach court covers + full gallery for باشگاه بهناز (idempotent by URL). */
export async function applyBehnazCourtPhotos(db: Db, clubId: string) {
  const courts = await db.court.findMany({
    where: { clubId },
    orderBy: { nameEn: 'asc' },
  })

  await db.club.update({
    where: { id: clubId },
    data: { image: BEHNAZ_COURT_1_COVER },
  })

  const courtIds: Partial<Record<1 | 2 | 3, string>> = {}
  for (const n of [1, 2, 3] as const) {
    const court = findCourt(courts, n)
    if (!court) continue
    courtIds[n] = court.id
    await db.court.update({
      where: { id: court.id },
      data: { image: BEHNAZ_COURT_COVERS[n] },
    })
  }

  const existing = await db.clubMedia.findMany({
    where: { clubId },
    select: { url: true, sortOrder: true },
  })
  const existingUrls = new Set(existing.map((m) => m.url))
  let sortOrder = existing.reduce((max, m) => Math.max(max, m.sortOrder), -1) + 1

  const created: string[] = []
  for (const photo of BEHNAZ_ALL_COURT_PHOTOS) {
    if (existingUrls.has(photo.url)) continue
    await db.clubMedia.create({
      data: {
        clubId,
        url: photo.url,
        sortOrder,
        captionFa: photo.captionFa,
        captionEn: photo.captionEn,
      },
    })
    created.push(photo.url)
    sortOrder += 1
  }

  return {
    clubId,
    cover: BEHNAZ_COURT_1_COVER,
    courtIds,
    mediaAdded: created,
    mediaSkipped: BEHNAZ_ALL_COURT_PHOTOS.filter((p) => existingUrls.has(p.url)).map((p) => p.url),
  }
}

/** @deprecated Prefer applyBehnazCourtPhotos */
export const applyBehnazCourt1Photos = applyBehnazCourtPhotos
