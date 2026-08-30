/** Active clubs a coach may book courts at — no owner affiliation. */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  await requireRole(event, 'COACH')

  const clubs = await prisma.club.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { nameFa: 'asc' },
    select: { id: true, nameFa: true, nameEn: true, city: true },
  })

  return { clubs }
})
