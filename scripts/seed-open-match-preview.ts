/**
 * Preview-only open match fixtures (local / staging). Never run against production Liara inbox-db.
 */
import { PrismaClient } from '@prisma/client'
import { addDaysToIsoDate, todayDateString } from '#shared/localDate.ts'
import { splitSlotPriceToman } from '#shared/openMatch.ts'

const db = new PrismaClient()

async function main() {
  const athlete = await db.user.findUnique({ where: { email: 'athlete@inbox.local' } })
  const owner = await db.user.findUnique({ where: { email: 'owner@inbox.local' } })
  if (!athlete || !owner) throw new Error('Run SEED_DEMO_DATA=true prisma db seed first')

  const secondAthlete = await db.user.upsert({
    where: { email: 'athlete2@inbox.local' },
    create: {
      email: 'athlete2@inbox.local',
      name: 'سارا ورزشی',
      role: 'ATHLETE',
      phone: '09129876543',
      gender: 'FEMALE',
    },
    update: {},
  })

  const padel = await db.sport.findUniqueOrThrow({ where: { slug: 'padel' } })
  await db.userSportSkillRating.upsert({
    where: { userId_sportId: { userId: athlete.id, sportId: padel.id } },
    create: {
      userId: athlete.id,
      sportId: padel.id,
      rating: 3.8,
      confidence: 0.42,
      assessmentStatus: 'ASSESSED',
      assessedAt: new Date(),
      matchesPlayed: 4,
    },
    update: {},
  })
  await db.userSportSkillRating.upsert({
    where: { userId_sportId: { userId: secondAthlete.id, sportId: padel.id } },
    create: {
      userId: secondAthlete.id,
      sportId: padel.id,
      rating: 4.1,
      confidence: 0.5,
      assessmentStatus: 'ASSESSED',
      assessedAt: new Date(),
    },
    update: {},
  })

  const club = await db.club.findFirst({ where: { slug: 'padel-zone-tehran' } })
  if (!club) throw new Error('padel-zone-tehran missing from seed')
  const court = await db.court.findFirst({ where: { clubId: club.id, sportId: padel.id } })
  if (!court) throw new Error('court missing')

  const date = addDaysToIsoDate(todayDateString(), 3)
  const times = ['10:00', '11:00', '12:00'] as const
  const slotIds: string[] = []
  for (const startTime of times) {
    const slot = await db.slot.upsert({
      where: { courtId_date_startTime: { courtId: court.id, date, startTime } },
      create: {
        courtId: court.id,
        date,
        startTime,
        endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, '0')}:00`,
        price: court.price,
        displayStatus: 'FREE',
      },
      update: {},
    })
    slotIds.push(slot.id)
  }

  const cutoff = new Date(`${date}T09:00:00+03:30`)
  const slotTotal = court.price

  async function fixture(opts: {
    slotId: string
    hostId: string
    paymentMode: 'HOST_PAYS' | 'SPLIT_ONLINE'
    status: 'OPEN' | 'COMPLETED'
    matchType: 'FRIENDLY' | 'COMPETITIVE'
    note: string
    extraParticipants?: string[]
  }) {
    await db.slot.update({ where: { id: opts.slotId }, data: { displayStatus: 'PUBLIC' } })
    const booking = await db.booking.create({
      data: {
        slotId: opts.slotId,
        userId: opts.hostId,
        guestName: 'میزبان',
        status: 'CONFIRMED',
        paymentStatus: opts.paymentMode === 'HOST_PAYS' ? 'PAID' : 'PENDING_ONLINE',
        source: 'PLATFORM',
      },
    })
    const maxPlayers = 4
    const shares = splitSlotPriceToman(slotTotal, maxPlayers)
    const openMatch = await db.openMatch.create({
      data: {
        hostUserId: opts.hostId,
        clubId: club.id,
        courtId: court.id,
        sportId: padel.id,
        slotId: opts.slotId,
        bookingId: booking.id,
        paymentMode: opts.paymentMode,
        matchType: opts.matchType,
        maxPlayers,
        minPlayers: 2,
        minLevel: 3,
        maxLevel: 5,
        slotTotalPrice: slotTotal,
        note: opts.note,
        fillCutoffAt: cutoff,
        status: opts.status === 'COMPLETED' ? 'COMPLETED' : 'OPEN',
        completedAt: opts.status === 'COMPLETED' ? new Date() : undefined,
      },
    })
    await db.openMatchParticipant.create({
      data: {
        openMatchId: openMatch.id,
        userId: opts.hostId,
        isHost: true,
        shareAmount: opts.paymentMode === 'SPLIT_ONLINE' ? shares[0] : 0,
        status: 'JOINED',
      },
    })
    for (const uid of opts.extraParticipants || []) {
      await db.openMatchParticipant.create({
        data: {
          openMatchId: openMatch.id,
          userId: uid,
          shareAmount: 0,
          status: 'JOINED',
        },
      })
    }
    return openMatch.id
  }

  const splitId = await fixture({
    slotId: slotIds[0]!,
    hostId: owner.id,
    paymentMode: 'SPLIT_ONLINE',
    status: 'OPEN',
    matchType: 'COMPETITIVE',
    note: 'دنگ آنلاین — تست پیش‌نمایش',
  })
  const hostId = await fixture({
    slotId: slotIds[1]!,
    hostId: athlete.id,
    paymentMode: 'HOST_PAYS',
    status: 'OPEN',
    matchType: 'FRIENDLY',
    note: 'پرداخت میزبان — تست پیش‌نمایش',
    extraParticipants: [secondAthlete.id],
  })
  const completedId = await fixture({
    slotId: slotIds[2]!,
    hostId: athlete.id,
    paymentMode: 'HOST_PAYS',
    status: 'COMPLETED',
    matchType: 'COMPETITIVE',
    note: 'بازی تمام‌شده — تست امتیاز هم‌بازی',
    extraParticipants: [secondAthlete.id],
  })

  console.log(JSON.stringify({ splitId, hostId, completedId }))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())