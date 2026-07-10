export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  })
  return { notifications, unreadCount }
})
