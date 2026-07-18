export default defineNuxtPlugin(() => {
  if (!import.meta.client) return

  const config = useRuntimeConfig()
  if (!config.public.enablePwa) return

  function syncPwaMeta() {
    const themeColor = '#C41E1E'
    const backgroundColor = '#F4EFE9'

    const themeMeta = document.querySelector('meta[name="theme-color"]')
    if (themeMeta) themeMeta.setAttribute('content', themeColor)

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (manifestLink) {
      const url = new URL(manifestLink.href, window.location.origin)
      url.searchParams.set('lang', 'fa')
      url.searchParams.set('dir', 'rtl')
      manifestLink.href = url.toString()
    }

    document.documentElement.style.setProperty('--sz-accent', themeColor)
    document.documentElement.style.setProperty('--sz-bg', backgroundColor)
  }

  syncPwaMeta()
})
