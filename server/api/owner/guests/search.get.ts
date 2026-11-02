import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { buildGuestSearchHit, type GuestSearchHit } from '#shared/guestSearch.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import { splitStoredFullName, userToGuestNamePair } from '#shared/userName.ts'

type GuestHit = GuestSearchHit

function toAsciiDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
}

function guestKey(mobile: string, name: string) {
  const phone = normalizeIranPhone(mobile) || mobile.trim()
  return phone || `name:${name.trim().toLowerCase()}`
}

function pushUnique(map: Map<string, GuestHit>, hit: GuestHit) {
  const name = hit.name.trim()
  const mobile = hit.mobile.trim()
  if (!name && !mobile) return
  const key = guestKey(mobile, name)
  const existing = map.get(key)
  if (!existing) {
    map.set(key, hit)
    return
  }
  // Prefer registered users, then contacts, then past bookings.
  const rank = { user: 3, contact: 2, booking: 1 } as const
  if (rank[hit.source] > rank[existing.source]) {
    map.set(key, {
      ...hit,
      name: name || existing.name,
      guestName: hit.guestName || existing.guestName,
      guestFamily: hit.guestFamily || existing.guestFamily,
      mobile: mobile || existing.mobile,
    })
    return
  }
  if (!existing.name && name) existing.name = name
  if (!existing.guestName && hit.guestName) existing.guestName = hit.guestName
  if (!existing.guestFamily && hit.guestFamily) existing.guestFamily = hit.guestFamily
  if (!existing.mobile && mobile) existing.mobile = mobile
}

function bookingGuestParts(booking: {
  guestName: string | null
  guestFamily: string | null
  user: { name: string | null; nameFamily: string | null; phone: string | null } | null
}) {
  if (booking.user?.name?.trim()) {
    return userToGuestNamePair(booking.user)
  }
  const family = String(booking.guestFamily || '').trim()
  if (family) {
    const pair = normalizeGuestNamePair(booking.guestName, booking.guestFamily)
    return { guestName: pair.guestName, guestFamily: pair.guestFamily }
  }
  const split = splitStoredFullName(booking.guestName || '')
  return { guestName: split.name, guestFamily: split.nameFamily }
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const raw = String(getQuery(event).q || '').trim()
  const q = toAsciiDigits(raw).trim()
  if (q.length < 2) return { guests: [] as GuestHit[] }

  const phoneHint = normalizeIranPhone(q) || (/\d{3,}/.test(q) ? q.replace(/\D/g, '') : '')
  const limit = 12

  // Club-scoped only: contacts + past bookings at this club (no global User directory).
  const [contacts, bookings] = await Promise.all([
    prisma.contact.findMany({
      where: {
        clubId: club.id,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { mobile: { contains: phoneHint || q } },
        ],
      },
      select: { name: true, mobile: true },
      take: limit,
      orderBy: [{ totalVisits: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.booking.findMany({
      where: {
        slot: { court: { clubId: club.id } },
        OR: [
          { guestName: { contains: q, mode: 'insensitive' } },
          { guestFamily: { contains: q, mode: 'insensitive' } },
          { guestMobile: { contains: phoneHint || q } },
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { user: { nameFamily: { contains: q, mode: 'insensitive' } } },
          { user: { phone: { contains: phoneHint || q } } },
        ],
      },
      select: {
        guestName: true,
        guestFamily: true,
        guestMobile: true,
        user: { select: { name: true, nameFamily: true, phone: true } },
      },
      take: 40,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const map = new Map<string, GuestHit>()

  for (const contact of contacts) {
    const split = splitStoredFullName(contact.name || '')
    pushUnique(map, buildGuestSearchHit({
      guestName: split.name,
      guestFamily: split.nameFamily,
      mobile: contact.mobile || '',
      source: 'contact',
    }))
  }

  for (const booking of bookings) {
    const parts = bookingGuestParts(booking)
    const mobile = booking.guestMobile || booking.user?.phone || ''
    pushUnique(map, buildGuestSearchHit({
      guestName: parts.guestName,
      guestFamily: parts.guestFamily,
      mobile,
      source: booking.user ? 'user' : 'booking',
    }))
  }

  const guests = [...map.values()]
    .filter((item) => item.name || item.mobile)
    .slice(0, limit)

  return { guests }
})
