import { PUBLIC_CLUB_DIRECTORY_WHERE } from '#shared/clubDirectory.ts'

export default defineEventHandler(async () => {
  const clubs = await prisma.club.findMany({
    where: PUBLIC_CLUB_DIRECTORY_WHERE,
    select: { id: true, slug: true, nameFa: true, nameEn: true, city: true },
    orderBy: { nameFa: 'asc' },
  })
  return clubs
})
