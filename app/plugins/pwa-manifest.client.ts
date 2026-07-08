export default defineNuxtPlugin(() => {
  if (!import.meta.client || !('serviceWorker' in navigator)) return

  const cleanupKey = 'inbox-sw-cleaned-v2'

  navigator.serviceWorker.getRegistrations()
    .then(async (registrations) => {
      if (!registrations.length || sessionStorage.getItem(cleanupKey) === '1') return

      await Promise.all(registrations.map((registration) => registration.unregister()))

      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }

      sessionStorage.setItem(cleanupKey, '1')
      window.location.reload()
    })
    .catch(() => {})
})
