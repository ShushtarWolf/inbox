import { PrismaClient, SlotDisplayStatus } from '@prisma/client'
import { hashSecret } from '../server/utils/password.ts'
import { formatHour, hourEnd, todayDateStr } from '../server/utils/slots.ts'

const prisma = new PrismaClient()

const SPORTS = [
  { slug: 'padel', nameFa: 'پدل', nameEn: 'Padel', icon: 'padel' },
  { slug: 'tennis', nameFa: 'تنیس', nameEn: 'Tennis', icon: 'tennis' },
]

const CLUBS = [
  {
    slug: 'padel-zone-tehran',
    nameFa: 'پدل زون تهران',
    nameEn: 'Padel Zone Tehran',
    city: 'تهران',
    district: 'ولنجک',
    image: '/demo/clubs/padel-zone-tehran.jpg',
    sport: 'padel',
    lat: 35.805,
    lng: 51.407,
    priceFrom: 550000,
    priceTo: 850000,
    featured: true,
    amenities: ['Parking', 'Cafe', 'Locker room', 'Shower'],
  },
  {
    slug: 'azadi-tennis',
    nameFa: 'تنیس آزادی',
    nameEn: 'Azadi Tennis',
    city: 'تهران',
    district: 'آزادی',
    image: '/demo/clubs/azadi-tennis.jpg',
    sport: 'tennis',
    lat: 35.725,
    lng: 51.275,
    priceFrom: 500000,
    priceTo: 780000,
    featured: true,
    amenities: ['Parking', 'Pro shop', 'Cafe'],
  },
  {
    slug: 'isfahan-padel-club',
    nameFa: 'باشگاه پدل اصفهان',
    nameEn: 'Isfahan Padel Club',
    city: 'اصفهان',
    district: 'مرداویج',
    image: '/demo/clubs/isfahan-padel-club.jpg',
    sport: 'padel',
    lat: 32.635,
    lng: 51.667,
    priceFrom: 420000,
    priceTo: 690000,
    featured: false,
    amenities: ['Parking', 'Kids area', 'Locker room'],
  },
  {
    slug: 'shiraz-tennis-academy',
    nameFa: 'آکادمی تنیس شیراز',
    nameEn: 'Shiraz Tennis Academy',
    city: 'شیراز',
    district: 'معالی‌آباد',
    image: '/demo/clubs/shiraz-tennis-academy.jpg',
    sport: 'tennis',
    lat: 29.625,
    lng: 52.505,
    priceFrom: 460000,
    priceTo: 720000,
    featured: false,
    amenities: ['Cafe', 'Recovery area', 'Parking'],
  },
]

const STATUSES: SlotDisplayStatus[] = ['FREE', 'RESERVED', 'PUBLIC', 'TEAM', 'PENDING', 'CANCELLED', 'CLOSED']

const json = (value: unknown) => JSON.stringify(value)

async function main() {
  const forceReset = process.env.FORCE_SEED_RESET === 'true'
  const isProduction = process.env.NODE_ENV === 'production'
  const userCount = await prisma.user.count()

  if (!forceReset && userCount > 0) {
    console.log('Seed skipped: database already has data. Set FORCE_SEED_RESET=true to wipe and reseed.')
    return
  }

  if (forceReset) {
    await prisma.campaignRecipient.deleteMany()
    await prisma.campaign.deleteMany()
    await prisma.contactSegment.deleteMany()
    await prisma.reminderRule.deleteMany()
    await prisma.payment.deleteMany()
    await prisma.reservationEvent.deleteMany()
    await prisma.waitlistEntry.deleteMany()
    await prisma.review.deleteMany()
    await prisma.clubMedia.deleteMany()
    await prisma.coachMedia.deleteMany()
    await prisma.staffMembership.deleteMany()
    await prisma.smsLog.deleteMany()
    await prisma.contact.deleteMany()
    await prisma.packageDraft.deleteMany()
    await prisma.seasonBooking.deleteMany()
    await prisma.booking.deleteMany()
    await prisma.coachSession.deleteMany()
    await prisma.coachAvailability.deleteMany()
    await prisma.slot.deleteMany()
    await prisma.equipment.deleteMany()
    await prisma.court.deleteMany()
    await prisma.coach.deleteMany()
    await prisma.club.deleteMany()
    await prisma.user.deleteMany()
    await prisma.sport.deleteMany()
  }

  if (isProduction) {
    for (const s of SPORTS) {
      await prisma.sport.upsert({ where: { slug: s.slug }, update: s, create: s })
    }
    console.log('Production seed complete: sports catalog only (no demo users).')
    return
  }

  for (const s of SPORTS) await prisma.sport.create({ data: s })

  const athlete = await prisma.user.create({
    data: {
      email: 'athlete@inbox.local',
      name: 'علی رضایی',
      nameEn: 'Ali Rezaei',
      role: 'ATHLETE',
      passwordHash: hashSecret('demo1234'),
      phone: '09121234567',
    },
  })
  const coachUser = await prisma.user.create({
    data: {
      email: 'coach@inbox.local',
      name: 'سارا محمدی',
      nameEn: 'Sara Mohammadi',
      role: 'COACH',
      passwordHash: hashSecret('demo1234'),
      phone: '09123334455',
    },
  })
  const owner = await prisma.user.create({
    data: {
      email: 'owner@inbox.local',
      name: 'مدیر باشگاه',
      nameEn: 'Club Owner',
      role: 'CLUB_ADMIN',
      passwordHash: hashSecret('demo1234'),
      phone: '09124445566',
    },
  })
  const manager = await prisma.user.create({
    data: {
      email: 'manager@inbox.local',
      name: 'مریم مدیر',
      nameEn: 'Maryam Manager',
      role: 'CLUB_ADMIN',
      passwordHash: hashSecret('demo1234'),
      phone: '09127778899',
    },
  })

  const padel = await prisma.sport.findUniqueOrThrow({ where: { slug: 'padel' } })
  const tennis = await prisma.sport.findUniqueOrThrow({ where: { slug: 'tennis' } })

  const clubBySlug: Record<string, string> = {}
  for (const c of CLUBS) {
    const sport = c.sport === 'padel' ? padel : tennis
    const club = await prisma.club.create({
      data: {
        slug: c.slug,
        nameFa: c.nameFa,
        nameEn: c.nameEn,
        addressFa: `${c.city}، ${c.district ?? ''}`.trim(),
        addressEn: `${c.district ?? ''}, ${c.city}`.replace(/^,\s*/, ''),
        city: c.city,
        district: c.district,
        image: c.image,
        priceFrom: c.priceFrom,
        priceTo: c.priceTo,
        ownerId: c.slug === 'padel-zone-tehran' || c.slug === 'azadi-tennis' ? owner.id : undefined,
        openHour: 8,
        closeHour: 22,
        lat: c.lat,
        lng: c.lng,
        featured: c.featured,
        rating: c.slug === 'padel-zone-tehran' ? 4.8 : c.slug === 'azadi-tennis' ? 4.7 : 4.5,
        descriptionFa: `باشگاه ${c.nameFa} برای رزرو سریع، زمین‌های استاندارد و تجربه خانوادگی طراحی شده است.`,
        descriptionEn: `${c.nameEn} offers fast booking, maintained courts, and a polished club experience.`,
        phone: '02188776655',
        whatsapp: '989121234567',
        amenitiesJson: json(c.amenities),
        pricingJson: json([
          { labelFa: 'صبح', labelEn: 'Morning', from: c.priceFrom, to: c.priceFrom + 70000 },
          { labelFa: 'عصر', labelEn: 'Evening', from: c.priceFrom + 100000, to: c.priceTo },
        ]),
        policiesJson: json([
          { titleFa: 'لغو', titleEn: 'Cancellation', bodyFa: 'لغو تا ۱۲ ساعت قبل رایگان است.', bodyEn: 'Free cancellation up to 12 hours before.' },
          { titleFa: 'حضور', titleEn: 'Arrival', bodyFa: 'لطفا ۱۵ دقیقه زودتر حضور داشته باشید.', bodyEn: 'Please arrive 15 minutes early.' },
        ]),
        verificationNote: 'Owner verified',
        verifiedAt: new Date('2026-01-10T10:00:00.000Z'),
      },
    })
    clubBySlug[c.slug] = club.id

    for (let i = 1; i <= 4; i++) {
      await prisma.court.create({
        data: {
          nameFa: `زمین ${i}`,
          nameEn: `Court ${i}`,
          price: c.priceFrom + i * 50000,
          clubId: club.id,
          sportId: sport.id,
        },
      })
    }

    await prisma.clubMedia.createMany({
      data: [0, 1, 2].map((offset) => ({
        clubId: club.id,
        url: c.image,
        sortOrder: offset,
        captionFa: `نمای باشگاه ${offset + 1}`,
        captionEn: `Club view ${offset + 1}`,
      })),
    })
  }

  const ownerClub = await prisma.club.findUniqueOrThrow({ where: { id: clubBySlug['padel-zone-tehran'] } })
  const secondOwnerClub = await prisma.club.findUniqueOrThrow({ where: { id: clubBySlug['azadi-tennis'] } })
  const courts = await prisma.court.findMany({ where: { clubId: ownerClub.id } })
  const today = todayDateStr()

  await prisma.staffMembership.createMany({
    data: [
      {
        userId: owner.id,
        clubId: ownerClub.id,
        role: 'OWNER',
        permissionsJson: json(['calendar', 'finance', 'crm', 'team']),
        active: true,
        isPrimary: true,
      },
      {
        userId: owner.id,
        clubId: secondOwnerClub.id,
        role: 'OWNER',
        permissionsJson: json(['calendar', 'finance', 'crm', 'team']),
        active: true,
        isPrimary: false,
      },
      {
        userId: manager.id,
        clubId: ownerClub.id,
        role: 'MANAGER',
        permissionsJson: json(['calendar', 'crm']),
        active: true,
        isPrimary: true,
      },
    ],
  })

  let si = 0
  for (const court of courts) {
    for (let h = 12; h <= 17; h++) {
      const status = STATUSES[si % STATUSES.length]!
      si++
      const slot = await prisma.slot.create({
        data: {
          courtId: court.id,
          date: today,
          startTime: formatHour(h),
          endTime: hourEnd(h),
          price: court.price,
          displayStatus: status,
        },
      })
      if (['RESERVED', 'PUBLIC', 'PENDING', 'TEAM'].includes(status)) {
        const booking = await prisma.booking.create({
          data: {
            slotId: slot.id,
            guestName: 'مهمان',
            guestFamily: 'باشگاه',
            guestMobile: '09120000000',
            paymentMethod: 'CASH',
            paymentStatus: status === 'PENDING' ? 'PAY_AT_CLUB' : 'PAID',
            source: 'CLUB',
            status: status === 'PENDING' ? 'PENDING' : 'CONFIRMED',
            comments: status === 'TEAM' ? 'جلسه تیمی' : 'رزرو نمونه',
          },
        })
        await prisma.reservationEvent.create({
          data: {
            type: 'CREATED',
            bookingId: booking.id,
            actorUserId: owner.id,
            metadataJson: json({ source: 'seed', slotStatus: status }),
          },
        })
        if (status !== 'PENDING') {
          await prisma.payment.create({
            data: {
              bookingId: booking.id,
              amount: slot.price,
              method: 'CASH',
              status: 'PAID',
            },
          })
        }
      }
    }
  }

  const sara = await prisma.coach.create({
    data: {
      nameFa: 'سارا محمدی',
      nameEn: 'Sara Mohammadi',
      city: 'تهران',
      sessionPrice: 450000,
      photo: '/demo/coaches/coach-1.jpg',
      bioFa: 'مربی پدل و تنیس با تمرکز بر بازیکنان مبتدی تا نیمه‌حرفه‌ای.',
      bioEn: 'Padel and tennis coach focused on beginner to intermediate players.',
      headlineFa: 'مربی تکنیک و تاکتیک',
      headlineEn: 'Technique and tactics coach',
      specialtiesJson: json(['Padel basics', 'Match tactics', 'Junior training']),
      credentialsJson: json(['PTR Level 1', 'Iran Padel Federation']),
      languagesJson: json(['فارسی', 'English']),
      sportId: padel.id,
      userId: coachUser.id,
      featured: true,
      verifiedAt: new Date('2026-02-01T10:00:00.000Z'),
      verificationNote: 'Identity and certificate verified',
      experienceYears: 7,
      clubId: ownerClub.id,
    },
  })
  const reza = await prisma.coach.create({
    data: {
      nameFa: 'رضا کریمی',
      nameEn: 'Reza Karimi',
      city: 'تهران',
      sessionPrice: 380000,
      photo: '/demo/coaches/coach-2.jpg',
      bioFa: 'مربی خصوصی تنیس برای بزرگسالان.',
      bioEn: 'Private tennis coach for adults.',
      headlineFa: 'تمرین خصوصی بزرگسالان',
      headlineEn: 'Adult private training',
      specialtiesJson: json(['Serve', 'Footwork']),
      credentialsJson: json(['ITF CBI workshop']),
      languagesJson: json(['فارسی']),
      sportId: tennis.id,
      featured: true,
      experienceYears: 5,
      clubId: secondOwnerClub.id,
    },
  })
  const maryam = await prisma.coach.create({
    data: {
      nameFa: 'مریم حسینی',
      nameEn: 'Maryam Hosseini',
      city: 'اصفهان',
      sessionPrice: 420000,
      photo: '/demo/coaches/coach-3.jpg',
      bioFa: 'مربی پدل بانوان و نوجوانان.',
      bioEn: 'Padel coach for women and teens.',
      headlineFa: 'تمرین پایه و مسابقه',
      headlineEn: 'Foundations and match prep',
      specialtiesJson: json(['Women coaching', 'Match prep']),
      credentialsJson: json(['National coach card']),
      languagesJson: json(['فارسی']),
      sportId: padel.id,
      experienceYears: 6,
      clubId: clubBySlug['isfahan-padel-club'],
    },
  })
  const amir = await prisma.coach.create({
    data: {
      nameFa: 'امیر نوری',
      nameEn: 'Amir Nouri',
      city: 'شیراز',
      sessionPrice: 350000,
      photo: '/demo/coaches/coach-4.jpg',
      bioFa: 'مربی تنیس با برنامه‌های تکنیکی کوتاه‌مدت.',
      bioEn: 'Tennis coach with short technical programs.',
      headlineFa: 'پکیج‌های ۴ جلسه‌ای',
      headlineEn: '4-session improvement packs',
      specialtiesJson: json(['Backhand', 'Beginner tennis']),
      credentialsJson: json(['Club academy certified']),
      languagesJson: json(['فارسی', 'English']),
      sportId: tennis.id,
      experienceYears: 4,
      clubId: clubBySlug['shiraz-tennis-academy'],
    },
  })

  await prisma.staffMembership.create({
    data: {
      userId: coachUser.id,
      clubId: ownerClub.id,
      role: 'COACH',
      permissionsJson: json(['schedule']),
      active: true,
      isPrimary: true,
      coachId: sara.id,
    },
  })

  for (const coach of [sara, reza, maryam, amir]) {
    for (const day of [0, 1, 2, 3, 4]) {
      await prisma.coachAvailability.create({
        data: { coachId: coach.id, dayOfWeek: day, startTime: coach.id === sara.id ? '09:00' : '10:00', endTime: '18:00' },
      })
    }

    await prisma.coachMedia.createMany({
      data: [0, 1].map((offset) => ({
        coachId: coach.id,
        url: coach.photo || '/demo/coaches/coach-1.jpg',
        sortOrder: offset,
        captionFa: `تمرین ${offset + 1}`,
        captionEn: `Session ${offset + 1}`,
      })),
    })
  }

  const coachSession = await prisma.coachSession.create({
    data: {
      coachId: sara.id,
      athleteId: athlete.id,
      date: today,
      startTime: '14:00',
      endTime: '15:00',
      price: sara.sessionPrice,
      paymentStatus: 'PAID',
    },
  })

  await prisma.payment.create({
    data: {
      coachSessionId: coachSession.id,
      amount: sara.sessionPrice,
      method: 'IPG',
      status: 'PAID',
    },
  })
  await prisma.reservationEvent.createMany({
    data: [
      { type: 'CREATED', coachSessionId: coachSession.id, actorUserId: athlete.id, metadataJson: json({ channel: 'coach-booking' }) },
      { type: 'CONFIRMED', coachSessionId: coachSession.id, actorUserId: coachUser.id, metadataJson: json({ channel: 'coach-booking' }) },
    ],
  })

  const equipData = [
    { nameFa: 'دوش', nameEn: 'Shower', category: 'CLUB' as const, price: 0 },
    { nameFa: 'رختکن', nameEn: 'Locker', category: 'CLUB' as const, price: 0 },
    { nameFa: 'پارکینگ', nameEn: 'Parking', category: 'CLUB' as const, price: 0 },
    { nameFa: 'توپ', nameEn: 'Ball', category: 'RENTAL' as const, price: 50000 },
    { nameFa: 'سبد توپ', nameEn: 'Ball basket', category: 'RENTAL' as const, price: 30000 },
    { nameFa: 'گریپ', nameEn: 'Grip', category: 'SELL' as const, price: 150000 },
    { nameFa: 'توپ فروشی', nameEn: 'Ball', category: 'SELL' as const, price: 200000 },
    { nameFa: 'Ball kid', nameEn: 'Ball kid', category: 'SERVICE' as const, price: 100000 },
  ]
  for (const e of equipData) {
    await prisma.equipment.create({ data: { ...e, clubId: ownerClub.id } })
  }

  const contacts = await prisma.contact.createManyAndReturn({
    data: [
      {
        clubId: ownerClub.id,
        name: 'علی رضایی',
        mobile: '09121234567',
        lastVisit: 'امروز',
        tagsJson: json(['loyal', 'evening']),
        source: 'booking',
        totalVisits: 11,
        lifetimeValue: 7200000,
        lastBookedAt: new Date(),
        inactiveDays: 0,
      },
      {
        clubId: ownerClub.id,
        name: 'مریم کریمی',
        mobile: '09131234567',
        lastVisit: '۳ روز پیش',
        tagsJson: json(['padel', 'campaign']),
        source: 'instagram',
        totalVisits: 4,
        lifetimeValue: 2100000,
        lastBookedAt: new Date(Date.now() - 3 * 86400000),
        inactiveDays: 3,
      },
      {
        clubId: ownerClub.id,
        name: 'حسین محمدی',
        mobile: '09191234567',
        lastVisit: '۱ هفته پیش',
        tagsJson: json(['at-risk']),
        source: 'walk-in',
        totalVisits: 2,
        lifetimeValue: 900000,
        lastBookedAt: new Date(Date.now() - 10 * 86400000),
        inactiveDays: 10,
        noShowCount: 1,
      },
    ],
  })

  const vipSegment = await prisma.contactSegment.create({
    data: {
      clubId: ownerClub.id,
      name: 'VIP',
      filterJson: json({ minVisits: 5 }),
    },
  })
  const winbackSegment = await prisma.contactSegment.create({
    data: {
      clubId: ownerClub.id,
      name: 'Needs reactivation',
      filterJson: json({ inactiveDays: 7 }),
    },
  })

  const campaign = await prisma.campaign.create({
    data: {
      clubId: ownerClub.id,
      name: 'Evening Padel Pack',
      channel: 'SMS',
      template: 'Book this week and get 10% off after 6pm.',
      status: 'SENT',
      segmentId: vipSegment.id,
      sentAt: new Date(),
    },
  })

  await prisma.campaignRecipient.createMany({
    data: contacts.map((contact) => ({
      campaignId: campaign.id,
      contactId: contact.id,
      status: contact.totalVisits >= 4 ? 'delivered' : 'queued',
    })),
  })

  await prisma.reminderRule.createMany({
    data: [
      { clubId: ownerClub.id, name: 'Upcoming booking reminder', triggerType: 'booking_upcoming', offsetHours: 4, template: 'Remember your booking today.' },
      { clubId: ownerClub.id, name: 'Win-back after inactivity', triggerType: 'inactive_customer', offsetHours: 0, template: 'We miss you. Your next court is waiting.' },
    ],
  })

  await prisma.smsLog.create({
    data: {
      clubId: ownerClub.id,
      message: 'یادآوری رزرو امروز',
      recipient: 'vip',
      segmentName: vipSegment.name,
      campaignName: campaign.name,
    },
  })

  await prisma.packageDraft.createMany({
    data: [
      {
        clubId: ownerClub.id,
        coachId: sara.id,
        title: 'پکیج صبح',
        capacity: 8,
        price: 2400000,
        discount: 10,
        startDate: today,
        finishDate: today,
        comment: 'سانس صبح هفته',
      },
      {
        clubId: ownerClub.id,
        coachId: sara.id,
        title: '4 جلسه خصوصی',
        capacity: 4,
        price: 1600000,
        discount: 5,
        startDate: today,
        comment: 'جلسات خصوصی تکنیکی',
      },
    ],
  })

  await prisma.review.createMany({
    data: [
      {
        targetType: 'CLUB',
        clubId: ownerClub.id,
        authorUserId: athlete.id,
        authorName: 'علی رضایی',
        rating: 5,
        title: 'محیط عالی',
        body: 'رزرو سریع بود و کیفیت زمین‌ها خیلی خوب بود.',
        isVerified: true,
      },
      {
        targetType: 'CLUB',
        clubId: ownerClub.id,
        authorName: 'Neda',
        rating: 4,
        body: 'تجربه کلی خوب بود و پارکینگ کمک کرد.',
        isVerified: false,
      },
      {
        targetType: 'COACH',
        coachId: sara.id,
        authorUserId: athlete.id,
        authorName: 'Ali',
        rating: 5,
        title: 'Great session',
        body: 'Clear drills and actionable feedback.',
        isVerified: true,
      },
      {
        targetType: 'COACH',
        coachId: reza.id,
        authorName: 'Mina',
        rating: 4,
        body: 'Professional and punctual.',
        isVerified: false,
      },
    ],
  })

  await prisma.waitlistEntry.createMany({
    data: [
      {
        clubId: ownerClub.id,
        courtId: courts[0]?.id,
        date: today,
        startTime: '20:00',
        endTime: '21:00',
        guestName: 'لیلا',
        guestMobile: '09125556677',
      },
      {
        clubId: ownerClub.id,
        coachId: sara.id,
        userId: athlete.id,
        date: today,
        startTime: '18:00',
        endTime: '19:00',
      },
    ],
  })

  console.log('Seed complete. Demo accounts: athlete@inbox.local / coach@inbox.local / owner@inbox.local — password: demo1234')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
