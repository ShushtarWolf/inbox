#!/usr/bin/env node
/** SEO & basic accessibility smoke — meta tags, lang, manifest. FA-only launch aware. */
import { extractHtmlLang, extractMeta, fetchPage } from './lib/smoke-helpers.mjs'

const base = process.env.BASE_URL || 'http://127.0.0.1:3000'

/** Ignore i18n/dev payload scripts — only check user-visible HTML. */
function visibleHtml(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
}

const faPages = [
  { path: '/', expectLang: 'fa' },
  { path: '/clubs', expectLang: 'fa' },
  { path: '/login', expectLang: 'fa' },
  { path: '/privacy', expectLang: 'fa' },
  { path: '/terms', expectLang: 'fa' },
  { path: '/about', expectLang: 'fa' },
  { path: '/contact', expectLang: 'fa' },
  { path: '/pricing', expectLang: 'fa' },
  { path: '/complaints', expectLang: 'fa' },
  { path: '/cancellation', expectLang: 'fa' },
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

    console.log(`ok  ${page.path} lang/viewport/description`)
  }

  // Soft-disabled EN routes must redirect (FA-only launch)
  await assertRedirect('/en')
  await assertRedirect('/en/clubs')

  // Terms page has brand/title content
  const { html: termsHtml } = await fetchPage(base, '/terms')
  const termsVisible = visibleHtml(termsHtml)
  if (!termsVisible.includes('<title') && !termsVisible.includes('inbox')) {
    throw new Error('/terms missing title or brand')
  }
  // Legal emails must render as real addresses, not vue-i18n escape litter
  if (termsVisible.includes("{'@'}") || termsVisible.includes('{"@"}')) {
    throw new Error('/terms still contains unescaped email markup')
  }
  if (termsVisible.includes('@inbox.ir') || !termsVisible.includes('support@inboxs.ir')) {
    throw new Error('/terms must use support@inboxs.ir (not inbox.ir)')
  }
  console.log('ok  /terms has page content')

  const { html: privacyHtml } = await fetchPage(base, '/privacy')
  const privacyVisible = visibleHtml(privacyHtml)
  if (privacyVisible.includes("{'@'}") || privacyVisible.includes('{"@"}')) {
    throw new Error('/privacy still contains unescaped email markup')
  }
  if (privacyVisible.includes('@inbox.ir') || !privacyVisible.includes('privacy@inboxs.ir')) {
    throw new Error('/privacy must use privacy@inboxs.ir (not inbox.ir)')
  }
  console.log('ok  /privacy email rendering')

  // PWA manifest (optional — off unless NUXT_PUBLIC_ENABLE_PWA=true)
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

  // robots.txt and sitemap — required for SEO
  const robots = await fetch(`${base}/robots.txt`)
  if (!robots.ok) throw new Error('robots.txt not found')
  const robotsText = await robots.text()
  if (!robotsText.includes('Sitemap')) throw new Error('robots.txt missing Sitemap directive')
  if (!robotsText.includes('OAI-SearchBot')) {
    throw new Error('robots.txt missing explicit AI search crawler allow')
  }
  console.log('ok  robots.txt present')

  const llms = await fetch(`${base}/llms.txt`)
  if (!llms.ok) throw new Error('llms.txt not found')
  const llmsText = await llms.text()
  if (!llmsText.includes('inboxs.ir') || !llmsText.includes('پدل')) {
    throw new Error('llms.txt missing brand / product description')
  }
  console.log('ok  llms.txt present')

  const gscVerify = await fetch(`${base}/google6944ecb2516e868f.html`)
  if (!gscVerify.ok) throw new Error('google6944ecb2516e868f.html not found')
  const gscText = await gscVerify.text()
  if (!gscText.includes('google-site-verification: google6944ecb2516e868f.html')) {
    throw new Error('GSC verification file has wrong body')
  }
  console.log('ok  GSC verification file present')

  const sitemap = await fetch(`${base}/sitemap.xml`)
  if (!sitemap.ok) throw new Error('sitemap.xml not found')
  const sitemapText = await sitemap.text()
  if (!sitemapText.includes('<urlset')) throw new Error('sitemap.xml invalid')
  if (sitemapText.includes('/en/')) {
    throw new Error('sitemap.xml still lists /en URLs')
  }
  if (sitemapText.includes('/login') || sitemapText.includes('/register')) {
    throw new Error('sitemap.xml should not prioritize /login or /register')
  }
  if (!sitemapText.includes('/about') || !sitemapText.includes('/clubs')) {
    throw new Error('sitemap.xml missing core discovery URLs')
  }
  if (!sitemapText.includes('/clubs/tehran/padel') || !sitemapText.includes('/clubs/tehran/tennis')) {
    throw new Error('sitemap.xml missing geo/sport hub URLs')
  }
  console.log('ok  sitemap.xml present (FA-only, discovery-focused)')

  if (!llmsText.includes('/clubs/tehran/padel') || !llmsText.includes('/clubs/tehran/tennis')) {
    throw new Error('llms.txt missing geo/sport hub URLs')
  }
  if (!llmsText.includes('زمین پدل تهران') || !llmsText.includes('زمین تنیس تهران')) {
    throw new Error('llms.txt missing Persian hub anchors')
  }
  console.log('ok  llms.txt lists Tehran hubs')

  // Homepage should expose Organization / WebApplication JSON-LD for search + AI
  const { html: homeHtml } = await fetchPage(base, '/')
  if (!homeHtml.includes('application/ld+json') || !homeHtml.includes('Organization')) {
    throw new Error('/ missing Organization JSON-LD')
  }
  if (!homeHtml.includes('WebApplication')) {
    throw new Error('/ missing WebApplication JSON-LD')
  }
  if (!homeHtml.includes('/clubs/tehran/padel') || !homeHtml.includes('زمین پدل تهران')) {
    throw new Error('/ missing Tehran padel hub discovery link')
  }
  if (!homeHtml.includes('/clubs/tehran/tennis') || !homeHtml.includes('زمین تنیس تهران')) {
    throw new Error('/ missing Tehran tennis hub discovery link')
  }
  console.log('ok  / Organization + WebApplication JSON-LD + hub links')

  const { html: clubsHtml } = await fetchPage(base, '/clubs')
  if (!clubsHtml.includes('/clubs/tehran/padel') || !clubsHtml.includes('زمین پدل تهران')) {
    throw new Error('/clubs missing Tehran padel hub discovery link')
  }
  if (!clubsHtml.includes('/clubs/tehran/tennis') || !clubsHtml.includes('زمین تنیس تهران')) {
    throw new Error('/clubs missing Tehran tennis hub discovery link')
  }
  console.log('ok  /clubs hub discovery links')

  // About / pricing FAQ schema
  for (const path of ['/about', '/pricing']) {
    const { html } = await fetchPage(base, path)
    if (!html.includes('FAQPage') || !html.includes('application/ld+json')) {
      throw new Error(`${path} missing FAQPage JSON-LD`)
    }
    console.log(`ok  ${path} FAQPage JSON-LD`)
  }

  // Login page basic a11y — phone OTP inputs
  const { html: loginHtml } = await fetchPage(base, '/login')
  const lang = extractHtmlLang(loginHtml)
  if (!lang) throw new Error('/login missing html lang attribute')
  if (!loginHtml.includes('login-phone') && !loginHtml.includes('type="tel"')) {
    console.warn('warn  /login phone input not detected in SSR HTML')
  }
  console.log('ok  /login lang attribute')

  // Favicon
  const favicon = await fetch(`${base}/favicon.svg`)
  if (!favicon.ok) throw new Error('favicon.svg missing')
  console.log('ok  favicon.svg present')

  console.log('smoke-seo ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
