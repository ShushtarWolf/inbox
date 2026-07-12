import { mapWorkerRecord } from '../../../utils/workers'

export default defineEventHandler(async (event) => {
  const { club, membership } = await requireOwnerClub(event, 'settings')
  requireClubOwner(membership)
  const workers = await prisma.clubWorker.findMany({
    where: { clubId: club.id, active: true },
    orderBy: [{ createdAt: 'asc' }],
  })
  return workers.map(mapWorkerRecord)
})
