/** Pick active owner club context (cookie + multi-club defaults). */

export type OwnerClubPickMembership = {
  isPrimary?: boolean
  club: { id: string; status?: string | null }
}

export function pickDefaultOwnerClubId(
  memberships: OwnerClubPickMembership[],
  selectedClubId?: string | null,
): string | null {
  if (!memberships.length) return null
  if (selectedClubId && memberships.some((m) => m.club.id === selectedClubId)) {
    return selectedClubId
  }
  const active = memberships.filter((m) => m.club.status === 'ACTIVE')
  if (active.length) {
    return (active.find((m) => m.isPrimary) || active[0])!.club.id
  }
  return (memberships.find((m) => m.isPrimary) || memberships[0])!.club.id
}

export function ownerHasActiveClub(memberships: OwnerClubPickMembership[]): boolean {
  return memberships.some((m) => m.club.status === 'ACTIVE')
}

export function pickOwnerMembership<T extends OwnerClubPickMembership & { clubId?: string }>(
  memberships: T[],
  selectedClubId?: string | null,
): T {
  if (selectedClubId) {
    const hit = memberships.find(
      (m) => m.club.id === selectedClubId || m.clubId === selectedClubId,
    )
    if (hit) return hit
  }
  const active = memberships.filter((m) => m.club.status === 'ACTIVE')
  if (active.length) {
    return (active.find((m) => m.isPrimary) || active[0])!
  }
  return (memberships.find((m) => m.isPrimary) || memberships[0])!
}