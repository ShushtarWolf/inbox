export default defineEventHandler(async () => {
  return prisma.sport.findMany({ orderBy: { slug: 'asc' } })
})
