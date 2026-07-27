/**
 * Microsoft Clarity — production-only UX heatmaps / session replay.
 * Requires NUXT_PUBLIC_CLARITY_ID. Sensitive fields stay masked by Clarity defaults.
 *
 * Injects via DOM (not useHead `children`) so the snippet actually executes —
 * Unhead was rendering `children` as a dead HTML attribute.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.env.PROD) return

  const clarityId = String(useRuntimeConfig().public.clarityId || '').trim()
  if (!clarityId) return
  if (document.querySelector(`script[data-clarity-project="${clarityId}"]`)) return

  // Official Clarity bootstrap (project id is JSON-stringified).
  const bootstrap = document.createElement('script')
  bootstrap.setAttribute('data-clarity-project', clarityId)
  bootstrap.textContent = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;t.setAttribute("data-clarity-project",i);y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(clarityId)});`
  document.head.appendChild(bootstrap)
})
