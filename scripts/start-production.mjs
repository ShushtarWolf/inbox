import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const dbUrl = process.env.DATABASE_URL || 'file:/app/data/inbox.db'
process.env.DATABASE_URL = dbUrl

if (dbUrl.startsWith('file:')) {
  const dbPath = dbUrl.replace(/^file:/, '')
  const dbDir = dirname(dbPath)
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
}

const env = { ...process.env, DATABASE_URL: dbUrl }

execSync('npx prisma db push --skip-generate', { stdio: 'inherit', env })
execSync('npx prisma db seed', { stdio: 'inherit', env })
execSync('node .output/server/index.mjs', { stdio: 'inherit', env })
