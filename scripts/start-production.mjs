import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('[start-production] DATABASE_URL is required')
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL: dbUrl }

// Recover from a previously failed slot unique-index migration in production.
try {
  execSync('npx prisma migrate resolve --rolled-back 20250711160000_slot_unique_constraint', {
    stdio: 'inherit',
    env,
  })
} catch {
  // No failed migration to resolve.
}

if (process.env.SKIP_MIGRATE !== 'true') {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env })
}

if (process.env.SEED_ON_EMPTY === 'true') {
  const prisma = new PrismaClient({ datasourceUrl: dbUrl })
  try {
    const userCount = await prisma.user.count()
    if (userCount === 0) {
      console.log('[start-production] Empty database — running seed (SEED_ON_EMPTY=true)')
      execSync('npx prisma db seed', {
        stdio: 'inherit',
        env: { ...env, NODE_ENV: 'production' },
      })
    } else {
      console.log('[start-production] Database has data — skipping seed')
    }
  } finally {
    await prisma.$disconnect()
  }
}

{
  const prisma = new PrismaClient({ datasourceUrl: dbUrl })
  try {
    const { cleanupDemoAccounts } = await import('./lib/cleanup-demo-accounts.mjs')
    const { deleted, emails } = await cleanupDemoAccounts(prisma)
    if (deleted > 0) {
      console.log(
        `[start-production] Removed ${deleted} demo account(s): ${emails.join(', ')}. Real users were kept.`,
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

execSync('node .output/server/index.mjs', { stdio: 'inherit', env })
