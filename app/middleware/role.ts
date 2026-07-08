export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const role = to.meta.role as string | undefined
  if (!role) return
  const { loggedIn, fetch: refreshSession } = useUserSession()
  const { user, fetch } = useAuth()
  if (!loggedIn.value) await refreshSession()
  if (!user.value) await fetch()
  if (!user.value) return navigateTo('/login')
  if (user.value.role !== role) {
    if (user.value.role === 'CLUB_ADMIN') return navigateTo('/owner')
    if (user.value.role === 'COACH') return navigateTo('/coach')
    return navigateTo('/athlete')
  }
})
