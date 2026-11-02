#!/usr/bin/env node
/**
 * Restore Booking.guestFamily (and SeasonBooking.guestFamily) from recoverable data:
 * - split legacy full name in guestName
 * - linked User.nameFamily when guest first name matches the account
 *
 * Usage:
 *   npm run db:backfill-booking-guest-family -- --dry-run
 *   DATABASE_URL='…production…' npm run db:backfill-booking-guest-family
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import {
  planBookingGuestFamilyBackfill,
  type BookingGuestBackfillReason,
} from '../shared/bookingGuestBackfill.ts'

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env'))

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

type Counts = Record<BookingGuestBackfillReason, number>

function bump(counts: Counts, reason: BookingGuestBackfillReason) {
  counts[reason] += 1
}

async function main() {
  const bookingCounts: Counts = {
    split_guest_name: 0,
    from_linked_user: 0,
    normalize_pair: 0,
  }
  const seasonCounts: Counts = {
    split_guest_name: 0,
    from_linked_user: 0,
    normalize_pair: 0,
  }

  let bookingScanned = 0
  let bookingWouldFix = 0
  let bookingUpdated = 0

  const bookingBatch = 500
  let bookingCursor: string | undefined
  for (;;) {
    const rows = await prisma.booking.findMany({
      take: bookingBatch,
      ...(bookingCursor ? { skip: 1, cursor: { id: bookingCursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        guestName: true,
        guestFamily: true,
        user: { select: { name: true, nameFamily: true } },
      },
    })
    if (!rows.length) break
    bookingCursor = rows[rows.length - 1]!.id

    for (const row of rows) {
      bookingScanned += 1
      const plan = planBookingGuestFamilyBackfill(row)
      if (!plan) continue
      bookingWouldFix += 1
      bump(bookingCounts, plan.reason)
      if (dryRun) continue
      await prisma.booking.update({
        where: { id: row.id },
        data: {
          guestName: plan.guestName,
          guestFamily: plan.guestFamily,
        },
      })
      bookingUpdated += 1
    }
    if (rows.length < bookingBatch) break
  }

  let seasonScanned = 0
  let seasonWouldFix = 0
  let seasonUpdated = 0
  let seasonCursor: string | undefined
  for (;;) {
    const rows = await prisma.seasonBooking.findMany({
      take: bookingBatch,
      ...(seasonCursor ? { skip: 1, cursor: { id: seasonCursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        guestName: true,
        guestFamily: true,
      },
    })
    if (!rows.length) break
    seasonCursor = rows[rows.length - 1]!.id

    for (const row of rows) {
      seasonScanned += 1
      const plan = planBookingGuestFamilyBackfill(row)
      if (!plan) continue
      seasonWouldFix += 1
      bump(seasonCounts, plan.reason)
      if (dryRun) continue
      await prisma.seasonBooking.update({
        where: { id: row.id },
        data: {
          guestName: plan.guestName || '',
          guestFamily: plan.guestFamily || '',
        },
      })
      seasonUpdated += 1
    }
    if (rows.length < bookingBatch) break
  }

  console.log(
    `[backfill-booking-guest-family] bookings scanned=${bookingScanned} wouldFix=${bookingWouldFix} updated=${bookingUpdated}${dryRun ? ' (dry-run)' : ''}`,
  )
  console.log('[backfill-booking-guest-family] booking reasons', bookingCounts)
  console.log(
    `[backfill-booking-guest-family] seasonBookings scanned=${seasonScanned} wouldFix=${seasonWouldFix} updated=${seasonUpdated}${dryRun ? ' (dry-run)' : ''}`,
  )
  console.log('[backfill-booking-guest-family] season reasons', seasonCounts)
}

main()
  .catch((err) => {
    console.error('[backfill-booking-guest-family] failed', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
