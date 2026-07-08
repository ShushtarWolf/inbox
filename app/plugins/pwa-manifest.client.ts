export default defineNuxtPlugin(() => {
  if (!import.meta.client || window.location.hostname !== 'localhost' || !('serviceWorker' in navigator)) {
    return
  }

  const cleanupKey = 'inbox-local-sw-cleaned'

  navigator.serviceWorker.getRegistrations()
    .then(async (registrations) => {
      // #region agent log
      fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'post-fix-browser',hypothesisId:'G',location:'app/plugins/pwa-manifest.client.ts',message:'localhost service worker cleanup check',data:{registrationCount:registrations.length,alreadyCleaned:sessionStorage.getItem(cleanupKey)==='1'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

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
