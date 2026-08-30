import { hasRole } from '#shared/roles.ts'
import { roleDashboardPath } from '#shared/returnTo.ts'

export default defineNuxtRouteMiddleware(async (to) => {
  const localePath = useLocalePath()
  const role = to.meta.role as string | undefined
  if (!role) return
  const { loggedIn, ready, fetch, user } = useUserSession()
  if (!ready.value) await fetch()
  if (!loggedIn.value) {
    return navigateTo(localePath({
      path: '/login',
      query: { returnTo: to.fullPath },
    }))
  }
  const sessionUser = user.value as {
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
    if (hasRole(rolesUser, 'CLUB_ADMIN')) return navigateTo(localePath('/owner/calendar'))
    if (hasRole(rolesUser, 'COACH')) return navigateTo(localePath('/coach'))
    return navigateTo(localePath(roleDashboardPath('ATHLETE')))
  }
})
