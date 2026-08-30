import {
  canAddRole,
  hasRole,
  isPlatformRole,
  LAST_PLATFORM_ROLE_COOKIE,
  userRoles,
  type PlatformRole,
} from '#shared/roles.ts'
import { roleDashboardPath } from '#shared/returnTo.ts'

/**
 * Client helpers for multi-role picker / switcher.
 * Last chosen role is stored in a shared cookie so the next OTP/password login
 * can skip the picker when that role is still held.
 */
export function usePlatformRoles() {
  const { user, fetch } = useAuth()
  const { pilotNoCoach } = usePilotFlags()
  const lastRole = useCookie<string | null>(LAST_PLATFORM_ROLE_COOKIE, {
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })

  const rolesUser = computed(() => {
    const session = user.value
    if (!session?.role) return null
    return {
      role: session.role,
      secondaryRole: session.secondaryRole,
      tertiaryRole: session.tertiaryRole,
    }
  })

  const heldRoles = computed(() => (rolesUser.value ? userRoles(rolesUser.value) : []))

  const coachStatus = computed(() => user.value?.coachApprovalStatus || null)

  const ownerClubStatus = computed(() => {
    const memberships = user.value?.memberships || []
    const membership = memberships.find((m) => m.club.id === selectedClubId.value) || memberships[0]
    return membership?.club?.status || null
  })

  function roleCardState(role: PlatformRole): 'live' | 'pending' | 'missing' {
    if (!rolesUser.value || !hasRole(rolesUser.value, role)) return 'missing'
    if (role === 'COACH') {
      if (coachStatus.value === 'PENDING' || coachStatus.value === 'REJECTED') return 'pending'
      return 'live'
    }
    if (role === 'CLUB_ADMIN') {
      if (ownerClubStatus.value === 'PENDING' || ownerClubStatus.value === 'SUSPENDED') return 'pending'
      return 'live'
    }
    return 'live'
  }

  function pathForRole(role: PlatformRole) {
    if (role === 'COACH' && roleCardState(role) === 'pending') return '/coach/pending'
    if (role === 'CLUB_ADMIN' && roleCardState(role) === 'pending') return '/owner/pending'
    return roleDashboardPath(role)
  }

  function rememberRole(role: PlatformRole) {
    lastRole.value = role
  }

  function canOfferCoach() {
    if (pilotNoCoach.value) return false
    if (!rolesUser.value) return true
    return canAddRole(rolesUser.value, 'COACH') && roleCardState('COACH') === 'missing'
  }

  function canOfferOwner() {
    if (!rolesUser.value) return true
    return canAddRole(rolesUser.value, 'CLUB_ADMIN') && roleCardState('CLUB_ADMIN') === 'missing'
  }

  function showNewRoleSection() {
    return canOfferCoach() || canOfferOwner()
  }

  async function chooseRole(role: PlatformRole) {
    if (!isPlatformRole(role)) return
    if (!rolesUser.value || !hasRole(rolesUser.value, role)) return
    rememberRole(role)
    const localePath = useLocalePath()
    await navigateTo(localePath(pathForRole(role)))
  }

  return {
    user,
    fetch,
    rolesUser,
    heldRoles,
    coachStatus,
    ownerClubStatus,
    roleCardState,
    pathForRole,
    rememberRole,
    canOfferCoach,
    canOfferOwner,
    showNewRoleSection,
    chooseRole,
    lastRole,
  }
}
