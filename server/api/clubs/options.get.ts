export default defineEventHandler(async () => {
  const clubs = await prisma.club.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true, nameFa: true, nameEn: true, city: true },
    orderBy: { nameFa: 'asc' },
  })
  return clubs
})
