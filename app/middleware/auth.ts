export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const { loggedIn, ready, fetch } = useUserSession()
  if (!ready.value) await fetch()
  if (!loggedIn.value && to.path !== '/login' && !to.path.endsWith('/login')) {
    return navigateTo('/login')
  }
})
