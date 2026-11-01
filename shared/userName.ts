import { formatGuestDisplayName, normalizeGuestNamePair } from './guestName.ts'

/** Display name for a User row (Persian first + family, same rules as desk guests). */
export function formatUserDisplayName(
  name?: string | null,
  nameFamily?: string | null,
): string {
  return formatGuestDisplayName(name, nameFamily)
}

export function normalizeUserNamePair(
  name?: string | null,
  nameFamily?: string | null,
): { name: string; nameFamily: string } {
  const pair = normalizeGuestNamePair(name, nameFamily)
  return { name: pair.guestName, nameFamily: pair.guestFamily }
}

/**
 * Backfill / default split for legacy single-string names:
 * first whitespace-delimited token → `name` (نام),
 * remainder → `nameFamily` (نام‌خانوادگی).
 * Single-token names stay in `name` with empty family.
 */
export function splitStoredFullName(full: string): { name: string; nameFamily: string } {
  const trimmed = String(full || '').trim()
  if (!trimmed) return { name: '', nameFamily: '' }
  const space = trimmed.indexOf(' ')
  if (space === -1) return { name: trimmed, nameFamily: '' }
  return {
    name: trimmed.slice(0, space),
    nameFamily: trimmed.slice(space + 1).trim(),
  }
}

export function resolveUserDisplayName(user: {
  name?: string | null
  nameFamily?: string | null
  nameEn?: string | null
}): string {
  const fa = formatUserDisplayName(user.name, user.nameFamily)
  if (fa) return fa
  return user.nameEn?.trim() || user.name?.trim() || ''
}

/** Map User.name/nameFamily to booking guest fields. */
export function userToGuestNamePair(user: {
  name?: string | null
  nameFamily?: string | null
}): { guestName: string; guestFamily: string } {
  const pair = normalizeUserNamePair(user.name, user.nameFamily)
  return { guestName: pair.name, guestFamily: pair.nameFamily }
}

/** Prisma User create/update payload from form/API parts. */
export function userNameFieldsFromParts(
  name?: string | null,
  nameFamily?: string | null,
): { name: string; nameFamily: string | null; nameEn: string } {
  const pair = normalizeUserNamePair(name, nameFamily)
  const display = formatUserDisplayName(pair.name, pair.nameFamily)
  return {
    name: pair.name || display,
    nameFamily: pair.nameFamily || null,
    nameEn: display || pair.name,
  }
}

/** Parse API/form body; returns null when no name fields sent. */
export function parseUserNameInput(body: {
  name?: string
  nameFamily?: string
}): { name: string; nameFamily: string | null; nameEn: string } | null {
  if (body.name === undefined && body.nameFamily === undefined) return null
  return userNameFieldsFromParts(body.name, body.nameFamily)
}
