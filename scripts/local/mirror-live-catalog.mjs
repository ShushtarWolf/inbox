// LOCAL dev DB only: mirror live public catalog so branch shots show live content/photos.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const list = await (await fetch('https://inboxs.ir/api/clubs')).json()
const owner = await db.user.findFirst({ where: { email: 'owner@inbox.local' } })
await db.club.updateMany({ where: { slug: { notIn: list.map(c => c.slug) } }, data: { status: 'SUSPENDED', featured: false } })
for (const c0 of list) {
  const d = await (await fetch('https://inboxs.ir/api/clubs/' + c0.slug)).json()
  const scal = ['nameFa','nameEn','addressFa','addressEn','city','district','lat','lng','rating','priceFrom','image','featured','status','openHour','closeHour','defaultSessionDurationMinutes','sessionDurationsJson','descriptionFa','descriptionEn','phone','whatsapp','amenitiesJson','policiesJson','pricingJson','priceTo','cancellationWindowHours','rescheduleWindowHours','waitlistEnabled']
  const data = Object.fromEntries(scal.map(k => [k, d[k] ?? null]).filter(([k, v]) => v !== null || ['district','image','descriptionFa','descriptionEn','phone','whatsapp','amenitiesJson','policiesJson','pricingJson','priceTo','sessionDurationsJson','lat','lng'].includes(k)))
  const club = await db.club.upsert({ where: { slug: d.slug }, create: { slug: d.slug, ...data, ownerId: c0.slug === 'iust-tennis' ? owner.id : null }, update: { ...data, ...(c0.slug === 'iust-tennis' ? { ownerId: owner.id } : {}) } })
  if (!(await db.court.count({ where: { clubId: club.id } }))) for (const ct of d.courts) {
    const sp = await db.sport.findUnique({ where: { slug: ct.sport.slug } })
    await db.court.create({ data: { clubId: club.id, sportId: sp.id, nameFa: ct.nameFa, nameEn: ct.nameEn, price: ct.price, image: ct.image } })
  }
  await db.clubMedia.deleteMany({ where: { clubId: club.id } })
  for (const [i, m] of (d.media || []).entries()) await db.clubMedia.create({ data: { clubId: club.id, url: m.url, sortOrder: i, captionFa: m.captionFa, captionEn: m.captionEn } })
  console.log('mirrored', d.slug, d.courts.length, (d.media || []).length)
}
await db.$disconnect()
