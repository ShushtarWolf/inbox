export default defineNuxtRouteMiddleware(async (to) => {
  const localePath = useLocalePath()
  const { loggedIn, ready, fetch } = useUserSession()
  if (!ready.value) await fetch()
  if (!loggedIn.value && to.path !== '/login' && !to.path.endsWith('/login')) {
    return navigateTo(localePath({
      path: '/login',
      query: { returnTo: to.fullPath },
    }))
  }
})
