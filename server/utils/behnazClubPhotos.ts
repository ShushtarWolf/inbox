import { BEHNAZ_COURT_1_COVER, BEHNAZ_COURT_1_PHOTOS } from '#shared/behnazClubPhotos.ts'

type Db = typeof prisma

/** Attach Court 1 cover + gallery photos to a club (idempotent by URL). */
export async function applyBehnazCourt1Photos(db: Db, clubId: string) {
  const courts = await db.court.findMany({
    where: { clubId },
    orderBy: { nameEn: 'asc' },
  })
  const court1 =
    courts.find((c) => c.nameEn === 'Court 1' || c.nameFa === 'زمین 1')
    || courts[0]
    || null

  await db.club.update({
    where: { id: clubId },
    data: { image: BEHNAZ_COURT_1_COVER },
  })

  if (court1) {
    await db.court.update({
      where: { id: court1.id },
      data: { image: BEHNAZ_COURT_1_COVER },
    })
  }

  const existing = await db.clubMedia.findMany({
    where: { clubId },
    select: { url: true, sortOrder: true },
  })
  const existingUrls = new Set(existing.map((m) => m.url))
  let sortOrder = existing.reduce((max, m) => Math.max(max, m.sortOrder), -1) + 1

  const created: string[] = []
  for (const photo of BEHNAZ_COURT_1_PHOTOS) {
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
    courtId: court1?.id ?? null,
    mediaAdded: created,
    mediaSkipped: BEHNAZ_COURT_1_PHOTOS.filter((p) => existingUrls.has(p.url)).map((p) => p.url),
  }
}
