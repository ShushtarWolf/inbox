/**
 * Ops: provision club desk staff by phone (OTP login).
 * Usage (prod shell): node scripts/provision-club-staff.mjs --slug iust-tennis --phone 09333383801 --name "کارمند" --role FRONT_DESK
 * Requires DATABASE_URL.
 */
import { PrismaClient } from '@prisma/client'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

function normalizeIranPhone(input) {
  if (!input) return null
  let digits = String(input).replace(/[^\d+]/g, '').trim()
  if (digits.startsWith('+98')) digits = `0${digits.slice(3)}`
  else if (digits.startsWith('98') && digits.length >= 12) digits = `0${digits.slice(2)}`
  else if (digits.startsWith('9') && digits.length === 10) digits = `0${digits}`
  digits = digits.replace(/\D/g, '')
  return /^09\d{9}$/.test(digits) ? digits : null
}

function phoneToSyntheticEmail(phone) {
  return `phone.${phone}@users.inbox.local`
}

function defaultPermissionsForRole(role) {
  switch (role) {
    case 'MANAGER':
      return ['calendar', 'finance:view', 'finance:transactions', 'finance:reports', 'finance:payouts', 'crm', 'team']
    case 'FRONT_DESK':
      return ['calendar', 'crm']
    case 'ANALYST':
      return ['finance:view', 'finance:transactions', 'finance:reports', 'crm']
    case 'COACH':
      return ['calendar']
    default:
      return ['calendar', 'crm']
  }
}

function platformRoleForStaffInvite(staffRole) {
  return staffRole === 'COACH' ? 'COACH' : 'CLUB_ADMIN'
}

const slug = arg('slug', 'iust-tennis')
const phone = normalizeIranPhone(arg('phone'))
const name = arg('name', 'کارمند')
const role = arg('role', 'FRONT_DESK')
const permissions = defaultPermissionsForRole(role)

if (!phone) {
  console.error('Invalid --phone')
  process.exit(1)
}

const prisma = new PrismaClient()

const club = await prisma.club.findFirst({
  where: slug === 'iust-tennis'
    ? {
        AND: [
          { OR: [{ slug: 'iust-tennis' }, { nameFa: { contains: 'علم و صنعت' } }] },
          { NOT: { nameFa: { contains: 'بهناز' } } },
        ],
      }
    : { slug },
  select: { id: true, slug: true, nameFa: true, city: true, status: true },
})

if (!club) {
  console.error('Club not found for', slug)
  process.exit(1)
}

let user = await prisma.user.findUnique({ where: { phone } })
let created = false
const targetRole = platformRoleForStaffInvite(role)

if (!user) {
  user = await prisma.user.create({
    data: {
      email: phoneToSyntheticEmail(phone),
      phone,
      name,
      nameEn: name,
      role: targetRole,
      locale: 'fa',
    },
  })
  created = true
}
else if (user.disabledAt) {
  console.error('Account disabled')
  process.exit(1)
}
else if (user.role !== targetRole && user.secondaryRole !== targetRole) {
  if (!user.secondaryRole && user.role !== targetRole) {
    // Prefer CLUB_ADMIN as primary for desk staff
    const primary = targetRole === 'CLUB_ADMIN' || user.role === 'ATHLETE' ? targetRole : user.role
    const secondary = primary === user.role ? targetRole : user.role
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: primary, secondaryRole: secondary === primary ? null : secondary },
    })
  }
}

const membership = await prisma.staffMembership.upsert({
  where: { userId_clubId_role: { userId: user.id, clubId: club.id, role } },
  create: {
    userId: user.id,
    clubId: club.id,
    role,
    permissionsJson: JSON.stringify(permissions),
    active: true,
  },
  update: {
    active: true,
    permissionsJson: JSON.stringify(permissions),
  },
})

console.log(JSON.stringify({
  ok: true,
  created,
  club: { id: club.id, slug: club.slug, nameFa: club.nameFa, status: club.status },
  user: { id: user.id, phone: user.phone, role: user.role, secondaryRole: user.secondaryRole },
  membership: { id: membership.id, role: membership.role, active: membership.active },
}, null, 2))

await prisma.$disconnect()
// silence unused
void require
