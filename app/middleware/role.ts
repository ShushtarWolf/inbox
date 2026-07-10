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
  if (user.value?.role !== role) {
    if (user.value?.role === 'CLUB_ADMIN') return navigateTo(localePath('/owner'))
    if (user.value?.role === 'COACH') return navigateTo(localePath('/coach'))
    return navigateTo(localePath('/athlete'))
  }
})
