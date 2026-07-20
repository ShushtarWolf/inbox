/** One-off: create GlitchTip database on shared Liara Postgres (inbox-db). */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT 1 AS ok FROM pg_database WHERE datname = 'glitchtip'",
  )
  if (Array.isArray(rows) && rows.length) {
    console.log('[create-glitchtip-db] database already exists')
  } else {
    await prisma.$executeRawUnsafe('CREATE DATABASE glitchtip')
    console.log('[create-glitchtip-db] database created')
  }
} catch (err) {
  console.error('[create-glitchtip-db] failed:', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
