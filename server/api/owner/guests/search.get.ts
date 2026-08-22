import { formatGuestDisplayName } from '#shared/guestName.ts'
import { normalizeIranPhone } from '#shared/phone.ts'

type GuestHit = {
  name: string
  mobile: string
  source: 'user' | 'contact' | 'booking'
}

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
    map.set(key, { name, mobile, source: hit.source })
    return
  }
  // Prefer registered users, then contacts, then past bookings.
  const rank = { user: 3, contact: 2, booking: 1 } as const
  if (rank[hit.source] > rank[existing.source]) {
    map.set(key, {
      name: name || existing.name,
      mobile: mobile || existing.mobile,
      source: hit.source,
    })
    return
  }
  if (!existing.name && name) existing.name = name
  if (!existing.mobile && mobile) existing.mobile = mobile
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
          { user: { phone: { contains: phoneHint || q } } },
        ],
      },
      select: {
        guestName: true,
        guestFamily: true,
        guestMobile: true,
        user: { select: { name: true, phone: true } },
      },
      take: 40,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const map = new Map<string, GuestHit>()

  for (const contact of contacts) {
    pushUnique(map, {
      name: contact.name || '',
      mobile: contact.mobile || '',
      source: 'contact',
    })
  }

  for (const booking of bookings) {
    const name = formatGuestDisplayName(booking.guestName, booking.guestFamily)
      || booking.user?.name
      || ''
    const mobile = booking.guestMobile || booking.user?.phone || ''
    pushUnique(map, {
      name,
      mobile,
      source: booking.user ? 'user' : 'booking',
    })
  }

  const guests = [...map.values()]
    .filter((item) => item.name || item.mobile)
    .slice(0, limit)

  return { guests }
})
