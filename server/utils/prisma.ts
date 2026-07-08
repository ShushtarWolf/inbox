import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL
    if (url === 'file:./dev.db' || url === 'file:dev.db') {
      const roots = [process.cwd(), join(process.cwd(), '..'), join(process.cwd(), '../..')]
      for (const root of roots) {
        const dbPath = join(root, 'prisma', 'dev.db')
        if (existsSync(dbPath)) return `file:${dbPath}`
      }
    }
    if (url.startsWith('file:./') || url.startsWith('file:../')) {
      const rel = url.replace(/^file:/, '')
      const roots = [process.cwd(), join(process.cwd(), '..'), join(process.cwd(), '../..')]
      for (const root of roots) {
        const dbPath = join(root, rel)
        if (existsSync(dbPath)) return `file:${dbPath}`
      }
    }
    return url
  }
  const roots = [process.cwd(), join(process.cwd(), '..'), join(process.cwd(), '../..')]
  for (const root of roots) {
    const dbPath = join(root, 'prisma', 'dev.db')
    if (existsSync(dbPath)) return `file:${dbPath}`
  }
  return 'file:./prisma/dev.db'
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveDatabaseUrl(),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
