import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allowSeedOnEmpty } from '../shared/stagingBoot.ts'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('[start-production] DATABASE_URL is required')
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL: dbUrl }

function run(command, label) {
  console.log(`[start-production] ${label}`)
  execSync(command, { stdio: 'inherit', env, cwd: appRoot })
}

function prismaClientGenerated() {
  const generated = join(appRoot, 'node_modules', '.prisma', 'client')
  return (
    existsSync(join(generated, 'index.js'))
    || existsSync(join(generated, 'default.js'))
    || existsSync(join(generated, 'index.mjs'))
  )
}

function ensurePrismaClientGenerated() {
  if (process.env.SKIP_PRISMA_GENERATE === 'true') {
    console.log('[start-production] SKIP_PRISMA_GENERATE=true — skipping prisma generate')
    return
  }
  if (prismaClientGenerated()) {
    console.log('[start-production] Prisma Client already present — running prisma generate to sync schema…')
  } else {
    console.log('[start-production] Prisma Client missing — running prisma generate…')
  }
  run('npx prisma generate', 'Generating Prisma Client…')
  if (!prismaClientGenerated()) {
    console.error(
      '[start-production] prisma generate finished but node_modules/.prisma/client is still missing',
    )
    process.exit(1)
  }
}

// Recover only if that migration is marked failed (ignore P3012 when it is already applied).
try {
  const status = execSync('npx prisma migrate status', { encoding: 'utf8', env, cwd: appRoot })
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

ensurePrismaClientGenerated()

const { PrismaClient } = await import('@prisma/client')

async function upsertSportsOnly(prisma) {
  // Keep boot alive when full prisma seed cannot resolve Nuxt aliases in the slim image.
  const sports = [
    { slug: 'padel', nameFa: 'پدل', nameEn: 'Padel', icon: 'padel' },
    { slug: 'tennis', nameFa: 'تنیس', nameEn: 'Tennis', icon: 'tennis' },
  ]
  for (const s of sports) {
    await prisma.sport.upsert({ where: { slug: s.slug }, update: s, create: s })
  }
  console.log('[start-production] Upserted sports catalog (padel, tennis)')
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
    try {
      run('npx prisma db seed', 'Seeding sports catalog…')
    } catch (err) {
      console.error(
        '[start-production] Full seed failed — falling back to sports-only upsert',
        err instanceof Error ? err.message : err,
      )
      await upsertSportsOnly(prisma)
    }
  } finally {
    await prisma.$disconnect()
  }
}

await ensureCatalog()

if (allowSeedOnEmpty()) {
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
} else if (process.env.SEED_ON_EMPTY === 'true') {
  console.log(
    '[start-production] SEED_ON_EMPTY=true ignored on production — unset on inbox or use staging (SENTRY_ENVIRONMENT=staging).',
  )
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