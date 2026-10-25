/**
 * Admin route guard. The secret is memory-only (useAdminSecret), so any /admin/* deep link
 * without an unlocked secret goes to /admin (the gate) with ?next= to return after unlock.
 * Server-side the admin API still enforces x-admin-secret on every call — this is UX + defence
 * in depth, not the auth boundary.
 */
import { adminNextTarget } from '#shared/adminNext.ts'

export default defineNuxtRouteMiddleware((to) => {
  const target = adminNextTarget(to.path)
  if (!target) return
  const { secret } = useAdminSecret()
  if (secret.value) return
  const localePath = useLocalePath()
  return navigateTo(
    { path: localePath('/admin'), query: { next: to.fullPath.replace(/^\/en(?=\/|$)/, '') } },
    { replace: true },
  )
})
