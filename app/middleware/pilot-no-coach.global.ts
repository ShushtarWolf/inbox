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
  const { pilotNoCoach } = usePilotFlags()
  if (!pilotNoCoach.value) return

  const path = stripLocale(to.path)
  const localePath = useLocalePath()

  // Owner coaches invite surface: stay in owner desk, not public /clubs.
  if (/^\/owner\/coaches(\/|$)/.test(path)) {
    return navigateTo(localePath('/owner/calendar'), { replace: true })
  }

  if (!PUBLIC_COACH_BLOCKED.some((re) => re.test(path))) return
  return navigateTo(localePath('/clubs'), { replace: true })
})
