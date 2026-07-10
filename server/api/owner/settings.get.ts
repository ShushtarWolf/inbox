export default defineEventHandler(async (event) => {
  const { club, membership } = await requireOwnerClub(event, 'settings')

  const [courtsCount, coachesCount] = await Promise.all([
    prisma.court.count({ where: { clubId: club.id } }),
    prisma.coach.count({ where: { clubId: club.id } }),
  ])

  return {
    club: {
      id: club.id,
      slug: club.slug,
      nameFa: club.nameFa,
      nameEn: club.nameEn,
      city: club.city,
      district: club.district,
      addressFa: club.addressFa,
      addressEn: club.addressEn,
      phone: club.phone,
      whatsapp: club.whatsapp,
      openHour: club.openHour,
      closeHour: club.closeHour,
      cancellationWindowHours: club.cancellationWindowHours,
      rescheduleWindowHours: club.rescheduleWindowHours,
      waitlistEnabled: club.waitlistEnabled,
    },
    membership: {
      role: membership.role,
      isPrimary: membership.isPrimary,
    },
    counts: {
      courts: courtsCount,
      coaches: coachesCount,
    },
  }
})
