export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const { loggedIn, fetch: refreshSession } = useUserSession()
  const { user, fetch } = useAuth()
  if (!loggedIn.value) await refreshSession()
  if (!user.value) await fetch()
  if (!loggedIn.value && !user.value && to.path !== '/login' && !to.path.endsWith('/login')) {
    return navigateTo('/login')
  }
})
