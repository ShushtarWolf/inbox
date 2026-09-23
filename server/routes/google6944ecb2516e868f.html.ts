/** Google Search Console HTML file verification (Nuxt does not serve root *.html from public/). */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=86400')
  return 'google-site-verification: google6944ecb2516e868f.html\n'
})
