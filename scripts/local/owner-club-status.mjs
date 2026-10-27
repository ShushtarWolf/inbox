import { PrismaClient } from '@prisma/client'
const db = new PrismaClient(); const st = process.argv[2]
const o = await db.user.findFirst({ where: { email: 'owner@inbox.local' } })
const r = await db.club.updateMany({ where: { ownerId: o.id, slug: { not: 'iust-tennis' } }, data: { status: st } }); console.log(r); await db.$disconnect()
