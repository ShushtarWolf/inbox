export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetch } = useAuth()
  if (!user.value) await fetch()
  if (!user.value && to.path !== '/login' && !to.path.endsWith('/login')) {
    return navigateTo('/login')
  }
})
