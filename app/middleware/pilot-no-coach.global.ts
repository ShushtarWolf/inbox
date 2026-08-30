const PUBLIC_COACH_BLOCKED = [
  /^\/coaches(\/|$)/,
  /^\/book\/coach(\/|$)/,
  // /book/package soft-lands on its own page (recurring reserve freeze) — not a coach route.
  /^\/register\/coach(\/|$)/,
  /^\/coach(\/|$)/,
]

function stripLocale(path: string) {
  return path.replace(/^\/en(?=\/|$)/, '') || '/'
}

export default defineNuxtRouteMiddleware((to) => {
  const { pilotNoCoach, packagesEnabled } = usePilotFlags()
  if (!pilotNoCoach.value) return

  const path = stripLocale(to.path)
  const localePath = useLocalePath()

  // Owner coaches desk removed — redirect legacy bookmarks into settings.
  if (/^\/owner\/coaches(\/|$)/.test(path)) {
    return navigateTo(localePath('/owner/settings'), { replace: true })
  }

  // Class packages: coach create UI is allowed when PACKAGES_ENABLED even if coach marketing is frozen.
  if (packagesEnabled.value && /^\/coach\/packages(\/|$)/.test(path)) return

  if (!PUBLIC_COACH_BLOCKED.some((re) => re.test(path))) return
  return navigateTo(localePath('/clubs'), { replace: true })
})
