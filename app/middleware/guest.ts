import { roleDashboardPath, sanitizeReturnTo } from '#shared/returnTo.ts'

function localeFromPath(path: string): 'fa' | 'en' {
  return path === '/en' || path.startsWith('/en/') ? 'en' : 'fa'
}

export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, ready, fetch, user } = useUserSession()
  if (!ready.value) await fetch()
  if (!loggedIn.value) return

  const urlLocale = localeFromPath(to.path)
  const returnTo = sanitizeReturnTo(to.query.returnTo, urlLocale)
  if (returnTo) {
    return navigateTo(returnTo)
  }

  const role = user.value?.role
  if (!role) return navigateTo(roleDashboardPath('ATHLETE', urlLocale))

  return navigateTo(roleDashboardPath(role, urlLocale))
})
