#!/usr/bin/env node
/** Fail fast when DATABASE_URL is not PostgreSQL. */
const url = process.env.DATABASE_URL || ''

if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
  console.error('[check-db] DATABASE_URL must be a PostgreSQL connection string.')
  console.error('[check-db] Example: postgresql://inbox:inbox@localhost:5432/inbox')
  console.error('[check-db] Start Postgres: docker compose up -d')
  process.exit(1)
}

console.log('[check-db] ok')
