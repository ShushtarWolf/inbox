#!/usr/bin/env node
/** Remove demo accounts (*@inbox.local). Requires CONFIRM=yes to execute. */
import { PrismaClient } from '@prisma/client'
import { cleanupDemoAccounts } from './lib/cleanup-demo-accounts.mjs'

if (process.env.CONFIRM !== 'yes') {
  console.error('Refusing to run without CONFIRM=yes')
  console.error('Usage: CONFIRM=yes node scripts/cleanup-demo-accounts.mjs')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const { deleted, emails } = await cleanupDemoAccounts(prisma)

  if (deleted === 0) {
    console.log('No demo accounts found.')
    process.exit(0)
  }

  console.log(`Found ${emails.length} demo account(s):`)
  for (const email of emails) console.log(`  - ${email}`)
  console.log(`Deleted ${deleted} demo account(s). Real users were kept.`)
} finally {
  await prisma.$disconnect()
}
