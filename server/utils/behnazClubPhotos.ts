import {
  PILOT_ALL_COURT_PHOTOS,
  PILOT_COURT_1_COVER,
  PILOT_COURT_COVERS,
} from '#shared/behnazClubPhotos.ts'
import {
  PILOT_CLUB_ADDRESS_EN,
  PILOT_CLUB_ADDRESS_FA,
  PILOT_CLUB_CITY,
  PILOT_CLUB_DISTRICT,
  PILOT_CLUB_LAT,
  PILOT_CLUB_LNG,
  PILOT_CLUB_NAME_EN,
  PILOT_CLUB_NAME_FA,
  PILOT_CLUB_PHONE,
  PILOT_CLUB_SLUG,
  PILOT_COURT_COUNT,
  PILOT_COURT_PRICE,
  PILOT_OWNER_PHONE,
  PILOT_SPORT_SLUG,
} from '#shared/pilotClub.ts'

type Db = typeof prisma

function findCourt(
  courts: Array<{ id: string; nameEn: string; nameFa: string }>,
  n: number,
) {
  return (
    courts.find((c) => c.nameEn === `Court ${n}` || c.nameFa === `زمین ${n}`)
    || null
  )
}

/** Rename + profile the MVP club as دانشگاه علم و صنعت. */
export async function syncPilotClubIdentity(db: Db, clubId: string) {
  const slugTaken = await db.club.findFirst({
    where: { slug: PILOT_CLUB_SLUG, NOT: { id: clubId } },
    select: { id: true },
  })
  const data = {
    nameFa: PILOT_CLUB_NAME_FA,
    nameEn: PILOT_CLUB_NAME_EN,
    city: PILOT_CLUB_CITY,
    district: PILOT_CLUB_DISTRICT,
    addressFa: PILOT_CLUB_ADDRESS_FA,
    addressEn: PILOT_CLUB_ADDRESS_EN,
    lat: PILOT_CLUB_LAT,
    lng: PILOT_CLUB_LNG,
    phone: PILOT_CLUB_PHONE,
    image: PILOT_COURT_1_COVER,
    featured: true,
    status: 'ACTIVE' as const,
    openHour: 8,
    closeHour: 22,
    priceFrom: PILOT_COURT_PRICE,
    ...(slugTaken ? {} : { slug: PILOT_CLUB_SLUG }),
  }
  return db.club.update({ where: { id: clubId }, data })
}

/** Set club owner User.phone so OTP login matches the real club number. */
export async function syncPilotOwnerPhone(db: Db, clubId: string) {
  const club = await db.club.findUnique({
    where: { id: clubId },
    select: { ownerId: true, owner: { select: { id: true, phone: true } } },
  })
  if (!club?.ownerId) {
    return { ownerId: null as string | null, phone: PILOT_OWNER_PHONE, updated: false }
  }
  if (club.owner?.phone === PILOT_OWNER_PHONE) {
    return { ownerId: club.ownerId, phone: PILOT_OWNER_PHONE, updated: false }
  }
  const taken = await db.user.findUnique({
    where: { phone: PILOT_OWNER_PHONE },
    select: { id: true },
  })
  if (taken && taken.id !== club.ownerId) {
    throw createError({
      statusCode: 409,
      statusMessage: `Phone ${PILOT_OWNER_PHONE} already belongs to another user`,
    })
  }
  await db.user.update({
    where: { id: club.ownerId },
    data: { phone: PILOT_OWNER_PHONE, phoneVerifiedAt: new Date() },
  })
  return { ownerId: club.ownerId, phone: PILOT_OWNER_PHONE, updated: true }
}

/** Ensure Courts 1–3 exist with covers (tennis when available). */
export async function ensurePilotCourts(db: Db, clubId: string) {
  const sport =
    (await db.sport.findFirst({ where: { slug: PILOT_SPORT_SLUG } }))
    || (await db.sport.findFirst({ where: { slug: 'padel' } }))
  if (!sport) {
    throw createError({ statusCode: 503, statusMessage: 'Sport catalog missing tennis/padel' })
  }

  let courts = await db.court.findMany({ where: { clubId } })
  const created: string[] = []

  for (let n = 1; n <= PILOT_COURT_COUNT; n += 1) {
    let court = findCourt(courts, n)
    if (!court) {
      court = await db.court.create({
        data: {
          nameFa: `زمین ${n}`,
          nameEn: `Court ${n}`,
          clubId,
          sportId: sport.id,
          price: PILOT_COURT_PRICE,
          image: PILOT_COURT_COVERS[n as 1 | 2 | 3],
        },
      })
      created.push(court.id)
      courts = await db.court.findMany({ where: { clubId } })
    } else {
      await db.court.update({
        where: { id: court.id },
        data: {
          sportId: sport.id,
          price: PILOT_COURT_PRICE,
          image: PILOT_COURT_COVERS[n as 1 | 2 | 3],
        },
      })
    }
  }

  return { sportSlug: sport.slug, created }
}

/** Attach full court gallery (idempotent by URL). */
export async function applyPilotCourtPhotos(db: Db, clubId: string) {
  // Replace gallery with the current IUST set (drops legacy demo/behnaz/dupes).
  await db.clubMedia.deleteMany({ where: { clubId } })

  const created: string[] = []
  for (const [index, photo] of PILOT_ALL_COURT_PHOTOS.entries()) {
    await db.clubMedia.create({
      data: {
        clubId,
        url: photo.url,
        sortOrder: index,
        captionFa: photo.captionFa,
        captionEn: photo.captionEn,
      },
    })
    created.push(photo.url)
  }

  return {
    mediaAdded: created,
    mediaSkipped: [] as string[],
  }
}

/** Full MVP sync: identity + 3 courts + gallery. */
export async function syncPilotClub(db: Db, clubId: string) {
  const club = await syncPilotClubIdentity(db, clubId)
  const ownerPhone = await syncPilotOwnerPhone(db, clubId)
  const courts = await ensurePilotCourts(db, clubId)
  const media = await applyPilotCourtPhotos(db, clubId)
  return {
    club: {
      id: club.id,
      slug: club.slug,
      nameFa: club.nameFa,
      nameEn: club.nameEn,
      phone: club.phone,
      image: club.image,
    },
    ownerPhone,
    courts,
    media,
    cover: PILOT_COURT_1_COVER,
  }
}

/** @deprecated Prefer syncPilotClub / applyPilotCourtPhotos */
export async function applyBehnazCourtPhotos(db: Db, clubId: string) {
  return syncPilotClub(db, clubId)
}

/** Restore catalog/court/open-slot prices only (does not rename the club). */
export async function restorePilotListPrice(db: Db, clubId: string) {
  const club = await db.club.update({
    where: { id: clubId },
    data: { priceFrom: PILOT_COURT_PRICE, priceTo: PILOT_COURT_PRICE },
    select: { id: true, slug: true, nameFa: true, priceFrom: true },
  })
  const courts = await db.court.updateMany({
    where: { clubId },
    data: { price: PILOT_COURT_PRICE },
  })
  const openSlots = await db.slot.updateMany({
    where: { court: { clubId }, booking: { is: null } },
    data: { price: PILOT_COURT_PRICE },
  })
  return {
    club,
    courtsUpdated: courts.count,
    openSlotsUpdated: openSlots.count,
    price: PILOT_COURT_PRICE,
  }
}

/** @deprecated Prefer applyBehnazCourtPhotos */
export const applyBehnazCourt1Photos = applyBehnazCourtPhotos
