import type { Prisma } from '@prisma/client'

/** Active clubs shown on catalog, search, homepage rails, sitemap, and llms.txt. */
export const PUBLIC_CLUB_DIRECTORY_WHERE: Prisma.ClubWhereInput = {
  status: 'ACTIVE',
  isUnlisted: false,
}