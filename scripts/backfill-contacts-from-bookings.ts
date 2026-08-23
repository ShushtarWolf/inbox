#!/usr/bin/env node
/**
 * Backfill CRM Contact rows from existing court bookings (per club).
 * Usage:
 *   npm run db:backfill-contacts
 *   npm run db:backfill-contacts -- --club <clubId>
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { backfillClubContacts } from '../server/utils/contactSync.ts'

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

function clubIdArg(): string | undefined {
  const idx = process.argv.indexOf('--club')
  if (idx === -1) return undefined
  return process.argv[idx + 1]?.trim() || undefined
}

async function main() {
  const onlyClubId = clubIdArg()
  const clubs = await prisma.club.findMany({
    where: onlyClubId ? { id: onlyClubId } : undefined,
    select: { id: true, nameFa: true, slug: true },
    orderBy: { createdAt: 'asc' },
  })

  if (onlyClubId && !clubs.length) {
    throw new Error(`Club not found: ${onlyClubId}`)
  }

  let total = 0
  for (const club of clubs) {
    const synced = await backfillClubContacts(club.id, prisma)
    total += synced
    console.log(`[backfill-contacts] ${club.nameFa || club.slug} (${club.id}): ${synced} contacts`)
  }

  console.log(`[backfill-contacts] done — ${total} contacts across ${clubs.length} club(s)`)
}

main()
  .catch((err) => {
    console.error('[backfill-contacts] failed', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
