import type { Prisma } from '@prisma/client'
import { ALL_OWNER_PERMISSIONS } from '#shared/ownerPermissions.ts'
import { uniqueClubSlug } from './slug'
import {
  normalizeOwnerSport,
  ownerSetupHandoff,
} from './ownerOnboarding'
import { createPendingOwnerApplication } from './ownerSignupApplication'

export type CreateOwnerClubInput = {
  clubNameFa: string
  clubNameEn?: string | null
  city?: string | null
  addressFa?: string | null
  addressEn?: string | null
  sport?: string | null
  courtCount?: number | string | null
  clubImage?: string | null
  galleryUrls?: string[] | null
  credentialUrls?: string[] | null
  contactName: string
  contactEmail: string
  contactPhone?: string | null
}

type Tx = Prisma.TransactionClient

export async function createOwnerClubForUser(tx: Tx, userId: string, input: CreateOwnerClubInput) {
  const clubNameFa = input.clubNameFa.trim()
  const clubNameEn = input.clubNameEn?.trim() || clubNameFa
  const city = input.city?.trim() || 'تهران'
  const addressFa = input.addressFa?.trim() || city
  const addressEn = input.addressEn?.trim() || addressFa
  const sportKey = normalizeOwnerSport(input.sport || undefined)
  const setupHandoff = ownerSetupHandoff(sportKey)

  const clubSlug = await uniqueClubSlug(clubNameEn || clubNameFa)
  const phone = input.contactPhone?.trim() || null

  const club = await tx.club.create({
    data: {
      slug: clubSlug,
      nameFa: clubNameFa,
      nameEn: clubNameEn,
      addressFa,
      addressEn,
      city,
      ownerId: userId,
      status: 'PENDING',
      image: input.clubImage?.trim() || null,
      credentialsJson: input.credentialUrls?.length ? JSON.stringify(input.credentialUrls) : null,
      phone,
    },
  })

  const hasMembership = await tx.staffMembership.findFirst({
    where: { userId, active: true },
    select: { id: true },
  })

  await tx.staffMembership.create({
    data: {
      userId,
      clubId: club.id,
      role: 'OWNER',
      permissionsJson: JSON.stringify(ALL_OWNER_PERMISSIONS),
      active: true,
      isPrimary: !hasMembership,
    },
  })

  if (input.galleryUrls?.length) {
    await tx.clubMedia.createMany({
      data: input.galleryUrls.map((url, index) => ({
        clubId: club.id,
        url,
        sortOrder: index,
      })),
    })
  }

  await createPendingOwnerApplication(tx, {
    clubId: club.id,
    clubName: clubNameFa,
    city,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: phone,
    sport: sportKey,
  })

  return { club, setupHandoff, sportKey }
}