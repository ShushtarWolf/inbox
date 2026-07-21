#!/usr/bin/env node
/** SEO & basic accessibility smoke — meta tags, lang, manifest. FA-only launch aware. */
import { extractHtmlLang, extractMeta, extractMetaProperty, extractTitle, fetchPage } from './lib/smoke-helpers.mjs'

const base = process.env.BASE_URL || 'http://localhost:3000'

const faPages = [
  { path: '/', expectLang: 'fa', titleIncludes: 'رزرو' },
  { path: '/clubs', expectLang: 'fa', titleIncludes: 'باشگاه' },
  { path: '/login', expectLang: 'fa', titleIncludes: 'ورود' },
  { path: '/privacy', expectLang: 'fa', titleIncludes: 'حریم' },
  { path: '/terms', expectLang: 'fa', titleIncludes: 'شرایط' },
  { path: '/about', expectLang: 'fa', titleIncludes: 'درباره' },
  { path: '/contact', expectLang: 'fa', titleIncludes: 'تماس' },
  { path: '/pricing', expectLang: 'fa', titleIncludes: 'قیمت' },
  { path: '/complaints', expectLang: 'fa', titleIncludes: 'شکایات' },
  { path: '/cancellation', expectLang: 'fa', titleIncludes: 'لغو' },
]

async function assertRedirect(path, { allowed = [301, 302, 307, 308] } = {}) {
  const res = await fetch(`${base}${path}`, { redirect: 'manual' })
  if (!allowed.includes(res.status)) {
    throw new Error(`${path} expected redirect (${allowed.join('/')}), got ${res.status}`)
  }
  console.log(`ok  ${path} → ${res.status} ${res.headers.get('location') || ''}`)
}

async function main() {
  console.log(`smoke-seo → ${base}`)

  for (const page of faPages) {
    const { html } = await fetchPage(base, page.path)
    const lang = extractHtmlLang(html)
    if (!lang || !lang.startsWith(page.expectLang)) {
      throw new Error(`${page.path} expected lang ${page.expectLang}, got ${lang || 'missing'}`)
    }

    const viewport = extractMeta(html, 'viewport')
    if (!viewport?.includes('width=device-width')) {
      throw new Error(`${page.path} missing viewport meta`)
    }

    const description = extractMeta(html, 'description')
    if (!description) {
      throw new Error(`${page.path} missing description meta`)
    }

    const title = extractTitle(html)
    if (!title || title === 'inbox') {
      throw new Error(`${page.path} missing unique title (got ${title || 'empty'})`)
    }
    if (page.titleIncludes && !title.includes(page.titleIncludes)) {
      throw new Error(`${page.path} title "${title}" missing "${page.titleIncludes}"`)
    }

    const ogTitle = extractMetaProperty(html, 'og:title')
    const ogDescription = extractMetaProperty(html, 'og:description')
    if (!ogTitle || !ogDescription) {
      throw new Error(`${page.path} missing Open Graph title/description`)
    }

    console.log(`ok  ${page.path} lang/viewport/description/title/og`)
  }

  await assertRedirect('/en')
  await assertRedirect('/en/clubs')

  const { html: termsHtml } = await fetchPage(base, '/terms')
  if (!termsHtml.includes('<title') && !termsHtml.includes('inbox')) {
    throw new Error('/terms missing title or brand')
  }
  if (termsHtml.includes("{'@'}") || termsHtml.includes('{"@"}')) {
    throw new Error('/terms still contains unescaped email markup')
  }
  if (termsHtml.includes('@inbox.ir') || !termsHtml.includes('support@inboxs.ir')) {
    throw new Error('/terms must use support@inboxs.ir (not inbox.ir)')
  }
  console.log('ok  /terms has page content')

  const { html: privacyHtml } = await fetchPage(base, '/privacy')
  if (privacyHtml.includes("{'@'}") || privacyHtml.includes('{"@"}')) {
    throw new Error('/privacy still contains unescaped email markup')
  }
  if (privacyHtml.includes('@inbox.ir') || !privacyHtml.includes('privacy@inboxs.ir')) {
    throw new Error('/privacy must use privacy@inboxs.ir (not inbox.ir)')
  }
  console.log('ok  /privacy email rendering')

  const manifestRes = await fetch(`${base}/manifest.webmanifest`)
  if (manifestRes.ok) {
    const manifest = await manifestRes.json()
    if (!manifest.name || !manifest.short_name) {
      throw new Error('manifest missing name fields')
    }
    if (String(manifest.name).includes('Sports Booking') || String(manifest.description || '').includes("every court's")) {
      throw new Error('manifest still has English Sports Booking copy — use FA for FA-only launch')
    }
    if (manifest.lang && !String(manifest.lang).startsWith('fa')) {
      throw new Error(`manifest lang should be fa, got ${manifest.lang}`)
    }
    console.log('ok  PWA manifest present (FA)')
  } else {
    console.warn('skip  PWA manifest not available (NUXT_PUBLIC_ENABLE_PWA unset)')
  }

  const robots = await fetch(`${base}/robots.txt`)
  if (!robots.ok) throw new Error('robots.txt not found')
  const robotsText = await robots.text()
  if (!robotsText.includes('Sitemap')) throw new Error('robots.txt missing Sitemap directive')
  console.log('ok  robots.txt present')

  const sitemap = await fetch(`${base}/sitemap.xml`)
  if (!sitemap.ok) throw new Error('sitemap.xml not found')
  const sitemapText = await sitemap.text()
  if (!sitemapText.includes('<urlset')) throw new Error('sitemap.xml invalid')
  if (sitemapText.includes('/en/')) {
    throw new Error('sitemap.xml still lists /en URLs')
  }
  console.log('ok  sitemap.xml present (FA-only)')

  const { html: loginHtml } = await fetchPage(base, '/login')
  const lang = extractHtmlLang(loginHtml)
  if (!lang) throw new Error('/login missing html lang attribute')
  if (!loginHtml.includes('type="email"') && !loginHtml.includes('type="password"')) {
    console.warn('warn  /login form inputs not detected in SSR HTML')
  }
  if (!loginHtml.includes('id="login-email"') || !loginHtml.includes('for="login-email"')) {
    console.warn('warn  /login email label wiring not detected in SSR HTML')
  }
  console.log('ok  /login lang attribute')

  const favicon = await fetch(`${base}/favicon.svg`)
  if (!favicon.ok) throw new Error('favicon.svg missing')
  console.log('ok  favicon.svg present')

  console.log('smoke-seo ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
