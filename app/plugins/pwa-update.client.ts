export default defineNuxtPlugin(() => {
  if (!import.meta.client || !('serviceWorker' in navigator)) return

  const config = useRuntimeConfig()
  if (!config.public.enablePwa) return

  const buildId = config.app?.buildId || 'unknown'
  const storageKey = 'inbox-pwa-build-id'

  async function purgeStaleCaches() {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  const previousBuild = localStorage.getItem(storageKey)
  if (previousBuild && previousBuild !== buildId) {
    localStorage.setItem(storageKey, buildId)
    purgeStaleCaches()
      .then(() => window.location.reload())
      .catch(() => window.location.reload())
    return
  }

  localStorage.setItem(storageKey, buildId)

  const { $pwa } = useNuxtApp()
  if ($pwa?.needRefresh) {
    $pwa.updateServiceWorker(true)
  }
})
