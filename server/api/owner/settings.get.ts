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
      image: club.image,
      openHour: club.openHour,
      closeHour: club.closeHour,
      defaultSessionDurationMinutes: club.defaultSessionDurationMinutes,
      sessionDurationsJson: club.sessionDurationsJson,
      amenitiesJson: club.amenitiesJson,
      cancellationWindowHours: club.cancellationWindowHours,
      rescheduleWindowHours: club.rescheduleWindowHours,
      waitlistEnabled: club.waitlistEnabled,
      media: await prisma.clubMedia.findMany({
        where: { clubId: club.id },
        orderBy: { sortOrder: 'asc' },
      }),
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
