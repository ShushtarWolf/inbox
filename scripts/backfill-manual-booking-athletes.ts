#!/usr/bin/env node
/**
 * Backfill ATHLETE users for orphan desk bookings (userId null + valid guestMobile).
 *
 * Default is dry-run (no writes). Pass --apply to create users and link bookings.
 *
 * Usage:
 *   npm run db:backfill-manual-booking-athletes
 *   npm run db:backfill-manual-booking-athletes -- --apply
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { runBackfillManualBookingAthletes } from '../server/utils/backfillManualBookingAthletes.ts'

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
const apply = process.argv.includes('--apply')

async function main() {
  if (apply) {
    console.log('[backfill-manual-booking-athletes] APPLY — writes enabled')
  }
  else {
    console.log('[backfill-manual-booking-athletes] dry-run (pass --apply to write)')
  }

  const summary = await runBackfillManualBookingAthletes(prisma, { dryRun: !apply })

  console.log(
    `[backfill-manual-booking-athletes] orphanBookings=${summary.orphanBookingCount} `
    + `distinctPhones=${summary.distinctPhoneCount} invalidSkipped=${summary.invalidPhoneSkipped}`,
  )

  if (summary.dryRun) {
    console.log(
      `[backfill-manual-booking-athletes] wouldCreateUsers=${summary.wouldCreateUsers} `
      + `wouldLinkUsers=${summary.wouldLinkUsers} wouldLinkBookings=${summary.wouldLinkBookings}`,
    )
  }
  else {
    console.log(
      `[backfill-manual-booking-athletes] usersCreated=${summary.usersCreated} `
      + `usersReused=${summary.usersReused} bookingsLinked≈${summary.bookingsLinked}`,
    )
  }

  for (const row of summary.phones.slice(0, 50)) {
    console.log(
      `[backfill-manual-booking-athletes] ${row.phoneMasked} bookings=${row.bookingCount} `
      + `action=${row.action}${row.guestName ? ` name=${row.guestName}` : ''}`,
    )
  }
  if (summary.phones.length > 50) {
    console.log(`[backfill-manual-booking-athletes] … ${summary.phones.length - 50} more phones (masked)`)
  }
}

main()
  .catch((err) => {
    console.error('[backfill-manual-booking-athletes] failed', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })