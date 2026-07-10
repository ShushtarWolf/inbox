export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user) return { user: null }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      nameEn: true,
      role: true,
      phone: true,
      locale: true,
      memberships: {
        where: { active: true },
        select: {
          role: true,
          isPrimary: true,
          permissionsJson: true,
          club: { select: { id: true, slug: true, nameFa: true, nameEn: true } },
        },
      },
    },
  })
  return { user }
})
