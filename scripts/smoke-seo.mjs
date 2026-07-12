#!/usr/bin/env node
/** SEO & basic accessibility smoke — meta tags, lang, manifest. */
import { extractHtmlLang, extractMeta, fetchPage } from './lib/smoke-helpers.mjs'

const base = process.env.BASE_URL || 'http://localhost:3000'

const pages = [
  { path: '/', locale: 'fa', expectLang: 'fa' },
  { path: '/clubs', locale: 'fa', expectLang: 'fa' },
  { path: '/en', locale: 'en', expectLang: 'en' },
  { path: '/en/clubs', locale: 'en', expectLang: 'en' },
  { path: '/login', locale: 'fa', expectLang: 'fa' },
]

async function main() {
  console.log(`smoke-seo → ${base}`)

  for (const page of pages) {
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

  // Terms page has brand/title content
  const { html: termsHtml } = await fetchPage(base, '/terms')
  if (!termsHtml.includes('<title') && !termsHtml.includes('inbox')) {
    throw new Error('/terms missing title or brand')
  }
  console.log('ok  /terms has page content')

  // PWA manifest
  const manifestRes = await fetch(`${base}/manifest.webmanifest`)
  if (manifestRes.ok) {
    const manifest = await manifestRes.json()
    if (!manifest.name || !manifest.short_name) {
      throw new Error('manifest missing name fields')
    }
    console.log('ok  PWA manifest present')
  } else {
    console.warn('skip  PWA manifest not available')
  }

  // robots.txt and sitemap — required for SEO
  const robots = await fetch(`${base}/robots.txt`)
  if (!robots.ok) throw new Error('robots.txt not found')
  const robotsText = await robots.text()
  if (!robotsText.includes('Sitemap')) throw new Error('robots.txt missing Sitemap directive')
  console.log('ok  robots.txt present')

  const sitemap = await fetch(`${base}/sitemap.xml`)
  if (!sitemap.ok) throw new Error('sitemap.xml not found')
  const sitemapText = await sitemap.text()
  if (!sitemapText.includes('<urlset')) throw new Error('sitemap.xml invalid')
  console.log('ok  sitemap.xml present')

  // Login page basic a11y — form inputs
  const { html: loginHtml } = await fetchPage(base, '/login')
  const lang = extractHtmlLang(loginHtml)
  if (!lang) throw new Error('/login missing html lang attribute')
  if (!loginHtml.includes('type="email"') && !loginHtml.includes('type="password"')) {
    console.warn('warn  /login form inputs not detected in SSR HTML')
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
