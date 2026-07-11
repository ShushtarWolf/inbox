#!/usr/bin/env node
/** Remove demo accounts (*@inbox.local). Requires CONFIRM=yes to execute. */
import { PrismaClient } from '@prisma/client'

if (process.env.CONFIRM !== 'yes') {
  console.error('Refusing to run without CONFIRM=yes')
  console.error('Usage: CONFIRM=yes node scripts/cleanup-demo-accounts.mjs')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@inbox.local' } },
    select: { id: true, email: true },
  })

  if (demoUsers.length === 0) {
    console.log('No demo accounts found.')
    process.exit(0)
  }

  console.log(`Found ${demoUsers.length} demo account(s):`)
  for (const u of demoUsers) console.log(`  - ${u.email}`)

  const ids = demoUsers.map((u) => u.id)
  const deleted = await prisma.user.deleteMany({ where: { id: { in: ids } } })
  console.log(`Deleted ${deleted.count} demo account(s).`)
} finally {
  await prisma.$disconnect()
}
