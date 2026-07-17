import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('[start-production] DATABASE_URL is required')
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL: dbUrl }

function run(command, label) {
  console.log(`[start-production] ${label}`)
  execSync(command, { stdio: 'inherit', env })
}

// Recover only if that migration is marked failed (ignore P3012 when it is already applied).
try {
  const status = execSync('npx prisma migrate status', { encoding: 'utf8', env })
  if (status.includes('20250711160000_slot_unique_constraint') && /failed/i.test(status)) {
    run(
      'npx prisma migrate resolve --rolled-back 20250711160000_slot_unique_constraint',
      'Resolving failed slot migration…',
    )
  }
} catch {
  // Status/resolve best-effort; migrate deploy below is the source of truth.
}

if (process.env.SKIP_MIGRATE !== 'true') {
  run('npx prisma migrate deploy', 'Applying database migrations…')
} else {
  console.log('[start-production] SKIP_MIGRATE=true — skipping migrations')
}

async function ensureCatalog() {
  const prisma = new PrismaClient({ datasourceUrl: dbUrl })
  try {
    const sportCount = await prisma.sport.count()
    if (sportCount > 0) {
      console.log('[start-production] Sports catalog present')
      return
    }
    console.log('[start-production] Sports catalog empty — seeding catalog')
    run('npx prisma db seed', 'Seeding sports catalog…')
  } finally {
    await prisma.$disconnect()
  }
}

await ensureCatalog()

if (process.env.SEED_ON_EMPTY === 'true') {
  const prisma = new PrismaClient({ datasourceUrl: dbUrl })
  try {
    const userCount = await prisma.user.count()
    if (userCount === 0) {
      console.log('[start-production] Empty database — running full seed (SEED_ON_EMPTY=true)')
      run('npx prisma db seed', 'Seeding empty database…')
    } else {
      console.log('[start-production] Database has users — skipping full seed')
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

run('node .output/server/index.mjs', 'Starting server…')
