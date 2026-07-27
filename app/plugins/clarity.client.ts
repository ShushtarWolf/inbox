/**
 * Microsoft Clarity — production-only UX heatmaps / session replay.
 * Requires NUXT_PUBLIC_CLARITY_ID. Sensitive fields stay masked by Clarity defaults.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.env.PROD) return

  const clarityId = String(useRuntimeConfig().public.clarityId || '').trim()
  if (!clarityId) return

  useHead({
    script: [
      {
        key: 'microsoft-clarity',
        children: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(clarityId)});`,
      },
    ],
  })
})
