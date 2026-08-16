import type { Prisma } from '@prisma/client'
import type { OwnerRegisterSport } from './ownerOnboarding'

type Tx = Prisma.TransactionClient

/** Link self-serve owner signup to the admin applications queue. */
export async function createPendingOwnerApplication(
  tx: Tx,
  opts: {
    clubId: string
    clubName: string
    city: string
    contactName: string
    contactEmail: string
    contactPhone?: string | null
    sport: OwnerRegisterSport
  },
) {
  const sportSlug = opts.sport === 'tennis' ? 'tennis' : 'padel'
  return tx.clubApplication.create({
    data: {
      clubName: opts.clubName,
      city: opts.city,
      contactName: opts.contactName,
      contactEmail: opts.contactEmail,
      contactPhone: opts.contactPhone || null,
      sportSlug,
      status: 'PENDING',
      clubId: opts.clubId,
    },
  })
}
