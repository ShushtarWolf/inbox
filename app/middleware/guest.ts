import { dashboardPathForRole } from '~/composables/useAuth'
import { sanitizeReturnTo } from '#shared/returnTo.ts'

export default defineNuxtRouteMiddleware(async (to) => {
  const { locale } = useI18n()
  const { loggedIn, ready, fetch, user } = useUserSession()
  if (!ready.value) await fetch()
  if (!loggedIn.value) return

  const urlLocale = locale.value === 'en' ? 'en' : 'fa'
  const returnTo = sanitizeReturnTo(to.query.returnTo, urlLocale)
  if (returnTo) {
    return navigateTo(returnTo)
  }

  const role = user.value?.role
  if (!role) return navigateTo(dashboardPathForRole('ATHLETE', urlLocale))

  return navigateTo(dashboardPathForRole(role, urlLocale))
})
