const BLOCKED = [
  /^\/coaches(\/|$)/,
  /^\/book\/coach(\/|$)/,
  /^\/register\/coach(\/|$)/,
  /^\/owner\/coaches(\/|$)/,
  /^\/coach(\/|$)/,
]

function stripLocale(path: string) {
  return path.replace(/^\/en(?=\/|$)/, '') || '/'
}

export default defineNuxtRouteMiddleware((to) => {
  const { pilotNoCoach } = usePilotFlags()
  if (!pilotNoCoach.value) return

  const path = stripLocale(to.path)
  if (!BLOCKED.some((re) => re.test(path))) return

  const localePath = useLocalePath()
  return navigateTo(localePath('/clubs'), { replace: true })
})
