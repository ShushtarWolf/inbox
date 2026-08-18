/** Trim guest first/last so calendar labels and desk saves never show or store a duplicated full name. */

function trimPart(value: string | null | undefined): string {
  return String(value || '').trim()
}

/** True when `container` is `part`, or contains `part` as a whole space-bounded span. */
function nameContains(container: string, part: string): boolean {
  if (!container || !part) return false
  if (container === part) return true
  return (
    container.startsWith(`${part} `)
    || container.endsWith(` ${part}`)
    || container.includes(` ${part} `)
  )
}

export function formatGuestDisplayName(
  guestName?: string | null,
  guestFamily?: string | null,
): string {
  const first = trimPart(guestName)
  const family = trimPart(guestFamily)
  if (!first) return family
  if (!family) return first
  if (nameContains(first, family)) return first
  if (nameContains(family, first)) return family
  return `${first} ${family}`
}

export function normalizeGuestNamePair(
  guestName?: string | null,
  guestFamily?: string | null,
): { guestName: string; guestFamily: string } {
  const first = trimPart(guestName)
  const family = trimPart(guestFamily)
  if (!first) return { guestName: family, guestFamily: '' }
  if (!family) return { guestName: first, guestFamily: '' }
  if (nameContains(first, family)) return { guestName: first, guestFamily: '' }
  if (nameContains(family, first)) return { guestName: family, guestFamily: '' }
  return { guestName: first, guestFamily: family }
}
