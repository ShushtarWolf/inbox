import { courtOrdinalFromName, toAsciiDigits } from '#shared/courtDisplay.ts'
import type { ClubMapping, CourtMapping } from '../types'

/** Match mapping court row to an Inbox court by id, name, or ordinal (زمین ۱ ≈ زمین 1). */
export function findCourtMapping(
  mapping: ClubMapping | null | undefined,
  court: { id: string; nameFa: string; nameEn?: string | null },
): CourtMapping | undefined {
  if (!mapping?.courts?.length) return undefined

  const byId = mapping.courts.find((item) => item.inboxCourtId === court.id)
  if (byId) return byId

  const nameAscii = toAsciiDigits(court.nameFa || '').trim()
  const byName = mapping.courts.find((item) => {
    if (!item.inboxCourtName) return false
    return toAsciiDigits(item.inboxCourtName).trim() === nameAscii
  })
  if (byName) return byName

  const ordinal = courtOrdinalFromName(court.nameFa, court.nameEn)
  if (ordinal == null) return undefined
  return mapping.courts.find((item) => {
    if (!item.inboxCourtName) return false
    return courtOrdinalFromName(item.inboxCourtName) === ordinal
  })
}
