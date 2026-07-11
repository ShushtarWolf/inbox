import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('[start-production] DATABASE_URL is required')
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL: dbUrl }

execSync('npx prisma migrate deploy', { stdio: 'inherit', env })

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
    const demoUsers = await prisma.user.count({
      where: { email: { endsWith: '@inbox.local' } },
    })
    if (demoUsers > 0) {
      console.warn(
        `[start-production] WARNING: ${demoUsers} demo account(s) (*@inbox.local) found in production. ` +
          'Run scripts/cleanup-demo-accounts.mjs with CONFIRM=yes to remove them.',
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

execSync('node .output/server/index.mjs', { stdio: 'inherit', env })
