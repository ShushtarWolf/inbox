import { staffCanAccessOwnerDesk } from '#shared/ownerDeskAccess.ts'
import { hasRole } from '#shared/roles.ts'
import { roleDashboardPath } from '#shared/returnTo.ts'

export default defineNuxtRouteMiddleware(async (to) => {
  const localePath = useLocalePath()
  const role = to.meta.role as string | undefined
  if (!role) return
  const { loggedIn, ready, fetch, user: sessionRef } = useUserSession()
  const { user, fetch: fetchAuth } = useAuth()
  if (!ready.value) await fetch()
  if (!loggedIn.value) {
    return navigateTo(localePath({
      path: '/login',
      query: { returnTo: to.fullPath },
    }))
  }
  const sessionUser = sessionRef.value as {
    role?: string
    secondaryRole?: string | null
    tertiaryRole?: string | null
  } | null
  if (!sessionUser?.role) {
    return navigateTo(localePath(roleDashboardPath('ATHLETE')))
  }
  const rolesUser = {
    role: sessionUser.role,
    secondaryRole: sessionUser.secondaryRole,
    tertiaryRole: sessionUser.tertiaryRole,
  }
  if (!hasRole(rolesUser, role)) {
    if (role === 'CLUB_ADMIN') {
      await fetchAuth()
      if (staffCanAccessOwnerDesk(user.value?.memberships)) return
    }
    if (hasRole(rolesUser, 'CLUB_ADMIN')) return navigateTo(localePath('/owner/calendar'))
    if (hasRole(rolesUser, 'COACH')) return navigateTo(localePath('/coach'))
    return navigateTo(localePath(roleDashboardPath('ATHLETE')))
  }
})
