import { mapWorkerRecord } from '~/server/utils/workers'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'team')
  const workers = await prisma.clubWorker.findMany({
    where: { clubId: club.id, active: true },
    orderBy: [{ createdAt: 'asc' }],
  })
  return workers.map(mapWorkerRecord)
})
