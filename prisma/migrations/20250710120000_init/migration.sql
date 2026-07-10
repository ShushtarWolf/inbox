-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ATHLETE', 'COACH', 'CLUB_ADMIN');

-- CreateEnum
CREATE TYPE "SlotDisplayStatus" AS ENUM ('FREE', 'RESERVED', 'PUBLIC', 'TEAM', 'PENDING', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAY_AT_CLUB', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('IPG', 'CASH', 'PAID', 'NOT_PAID');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('PLATFORM', 'CLUB');

-- CreateEnum
CREATE TYPE "EquipmentCategory" AS ENUM ('CLUB', 'RENTAL', 'SELL', 'SERVICE');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'MANAGER', 'FRONT_DESK', 'COACH', 'ANALYST');

-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('CLUB', 'COACH');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('ACTIVE', 'NOTIFIED', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationEventType" AS ENUM ('CREATED', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'WAITLIST_JOINED', 'WAITLIST_NOTIFIED', 'WAITLIST_CONVERTED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "role" "Role" NOT NULL DEFAULT 'ATHLETE',
    "locale" TEXT NOT NULL DEFAULT 'fa',
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sport" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "icon" TEXT NOT NULL,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "addressFa" TEXT NOT NULL,
    "addressEn" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "priceFrom" INTEGER NOT NULL DEFAULT 500000,
    "image" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "openHour" INTEGER NOT NULL DEFAULT 8,
    "closeHour" INTEGER NOT NULL DEFAULT 22,
    "descriptionFa" TEXT,
    "descriptionEn" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "amenitiesJson" TEXT,
    "policiesJson" TEXT,
    "pricingJson" TEXT,
    "verificationNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "priceTo" INTEGER,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 12,
    "rescheduleWindowHours" INTEGER NOT NULL DEFAULT 24,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 600000,
    "clubId" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "displayStatus" "SlotDisplayStatus" NOT NULL DEFAULT 'FREE',
    "courtId" TEXT NOT NULL,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAY_AT_CLUB',
    "paymentMethod" "PaymentMethod",
    "source" "BookingSource" NOT NULL DEFAULT 'PLATFORM',
    "guestName" TEXT,
    "guestFamily" TEXT,
    "guestMobile" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "rescheduledToBookingId" TEXT,
    "rescheduledFromBookingId" TEXT,
    "noShowAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "userId" TEXT,
    "slotId" TEXT NOT NULL,
    "coachId" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonBooking" (
    "id" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestFamily" TEXT NOT NULL,
    "guestMobile" TEXT NOT NULL,
    "daysJson" TEXT NOT NULL,
    "timesJson" TEXT NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "SeasonBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coach" (
    "id" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.8,
    "sessionPrice" INTEGER NOT NULL DEFAULT 400000,
    "photo" TEXT,
    "bioFa" TEXT,
    "bioEn" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "headlineFa" TEXT,
    "headlineEn" TEXT,
    "specialtiesJson" TEXT,
    "credentialsJson" TEXT,
    "languagesJson" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationNote" TEXT,
    "experienceYears" INTEGER NOT NULL DEFAULT 0,
    "isBookable" BOOLEAN NOT NULL DEFAULT true,
    "sportId" TEXT NOT NULL,
    "userId" TEXT,
    "clubId" TEXT,

    CONSTRAINT "Coach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachSession" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAY_AT_CLUB',
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "rescheduledToSessionId" TEXT,
    "rescheduledFromSessionId" TEXT,
    "noShowAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,

    CONSTRAINT "CoachSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachAvailability" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,

    CONSTRAINT "CoachAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubMedia" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "captionFa" TEXT,
    "captionEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "ClubMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachMedia" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "captionFa" TEXT,
    "captionEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coachId" TEXT NOT NULL,

    CONSTRAINT "CoachMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "targetType" "ReviewTargetType" NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorUserId" TEXT,
    "clubId" TEXT,
    "coachId" TEXT,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "category" "EquipmentCategory" NOT NULL,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "lastVisit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tagsJson" TEXT,
    "source" TEXT,
    "totalVisits" INTEGER NOT NULL DEFAULT 0,
    "lifetimeValue" INTEGER NOT NULL DEFAULT 0,
    "lastBookedAt" TIMESTAMP(3),
    "inactiveDays" INTEGER NOT NULL DEFAULT 0,
    "consentSms" BOOLEAN NOT NULL DEFAULT true,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "segmentName" TEXT,
    "campaignName" TEXT,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageDraft" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 8,
    "price" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "startDate" TEXT,
    "finishDate" TEXT,
    "daysJson" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,
    "coachId" TEXT,

    CONSTRAINT "PackageDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "guestName" TEXT,
    "guestMobile" TEXT,
    "userId" TEXT,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT,
    "coachId" TEXT,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationEvent" (
    "id" TEXT NOT NULL,
    "type" "ReservationEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" TEXT,
    "actorUserId" TEXT,
    "bookingId" TEXT,
    "coachSessionId" TEXT,

    CONSTRAINT "ReservationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookingId" TEXT,
    "coachSessionId" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filterJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "ContactSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'SMS',
    "template" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,
    "segmentId" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "offsetHours" INTEGER NOT NULL DEFAULT 0,
    "template" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMembership" (
    "id" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "permissionsJson" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "coachId" TEXT,

    CONSTRAINT "StaffMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_slug_key" ON "Sport"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE INDEX "Slot_courtId_date_idx" ON "Slot"("courtId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_slotId_key" ON "Booking"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "Coach_userId_key" ON "Coach"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "Payment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_coachSessionId_key" ON "Payment"("coachSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMembership_userId_clubId_role_key" ON "StaffMembership"("userId", "clubId", "role");

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonBooking" ADD CONSTRAINT "SeasonBooking_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSession" ADD CONSTRAINT "CoachSession_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSession" ADD CONSTRAINT "CoachSession_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAvailability" ADD CONSTRAINT "CoachAvailability_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMedia" ADD CONSTRAINT "ClubMedia_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMedia" ADD CONSTRAINT "CoachMedia_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageDraft" ADD CONSTRAINT "PackageDraft_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageDraft" ADD CONSTRAINT "PackageDraft_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationEvent" ADD CONSTRAINT "ReservationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationEvent" ADD CONSTRAINT "ReservationEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationEvent" ADD CONSTRAINT "ReservationEvent_coachSessionId_fkey" FOREIGN KEY ("coachSessionId") REFERENCES "CoachSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_coachSessionId_fkey" FOREIGN KEY ("coachSessionId") REFERENCES "CoachSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSegment" ADD CONSTRAINT "ContactSegment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "ContactSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMembership" ADD CONSTRAINT "StaffMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMembership" ADD CONSTRAINT "StaffMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMembership" ADD CONSTRAINT "StaffMembership_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE SET NULL ON UPDATE CASCADE;
