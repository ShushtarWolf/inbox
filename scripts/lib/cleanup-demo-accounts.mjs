/** Remove demo accounts (*@inbox.local). Real users (OAuth, registration, invites) are kept. */

export async function cleanupDemoAccounts(prisma) {
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@inbox.local' } },
    select: { id: true, email: true },
  })

  if (demoUsers.length === 0) {
    return { deleted: 0, emails: [] }
  }

  const ids = demoUsers.map((u) => u.id)
  const emails = demoUsers.map((u) => u.email)

  await prisma.club.updateMany({
    where: { ownerId: { in: ids } },
    data: { ownerId: null },
  })

  await prisma.coach.updateMany({
    where: { userId: { in: ids } },
    data: { userId: null },
  })

  await prisma.reservationEvent.updateMany({
    where: { actorUserId: { in: ids } },
    data: { actorUserId: null },
  })

  await prisma.review.updateMany({
    where: { authorUserId: { in: ids } },
    data: { authorUserId: null },
  })

  await prisma.waitlistEntry.updateMany({
    where: { userId: { in: ids } },
    data: { userId: null },
  })

  const deleted = await prisma.user.deleteMany({ where: { id: { in: ids } } })
  return { deleted: deleted.count, emails }
}
