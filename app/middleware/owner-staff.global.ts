function stripLocale(path: string) {
  return path.replace(/^\/en(?=\/|$)/, '') || '/'
}

/**
 * Hide standalone owner «کارکنان» (/owner/workers) unless OWNER_STAFF_ENABLED.
 * Settings still embeds workers roster + desk staff invite/permissions. Does not
 * affect /owner/calendar (desk ops, external staff overlay, coach pickers, etc.).
 */
export default defineNuxtRouteMiddleware((to) => {
  const { ownerStaffEnabled } = usePilotFlags()
  if (ownerStaffEnabled.value) return

  const path = stripLocale(to.path)
  if (!/^\/owner\/workers(\/|$)/.test(path)) return

  const localePath = useLocalePath()
  return navigateTo(localePath('/owner/settings'), { replace: true })
})
