import { isAuthProtectedPath } from '#shared/returnTo.ts'

export default defineNuxtPlugin(() => {
  if (!import.meta.client) return

  const localePath = useLocalePath()
  const { clear } = useUserSession()
  const profile = useState<unknown | null>('auth-profile', () => null)
  const ownerClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
  let handlingUnauthorized = false

  const api = $fetch.create({
    onResponseError: async (error) => {
      if (error.response?.status !== 401 || handlingUnauthorized) return

      const route = useRoute()
      if (route.path.endsWith('/login')) return

      // Always drop stale client auth
      profile.value = null
      ownerClubId.value = null
      try {
        await clear()
      } catch {
        // ignore clear failures
      }

      // Public catalog (home/clubs/book): stay on page — no session modal
      if (!isAuthProtectedPath(route.path)) return

      handlingUnauthorized = true
      try {
        await navigateTo(localePath({
          path: '/login',
          query: {
            error: 'session',
            returnTo: route.fullPath,
          },
        }))
      } finally {
        handlingUnauthorized = false
      }
    },
  })

  globalThis.$fetch = api
})
