import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Static routes derived from app/pages (no dynamic segments). */
export function staticPageRoutes() {
  const pagesDir = path.join(ROOT, 'app/pages')
  const modulePages = [
    { path: '/owner/calendar-sources', source: 'modules/inbox-external-calendar/runtime/pages/owner/calendar-sources.vue' },
    { path: '/admin/calendar-sources', source: 'modules/inbox-external-calendar/runtime/pages/admin/calendar-sources.vue' },
  ]
  const routes = []
  function walk(dir, prefix = '') {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name.startsWith('[')) continue
        walk(full, `${prefix}/${ent.name}`)
      } else if (ent.name.endsWith('.vue')) {
        if (/^\[[^\]]+\]\.vue$/.test(ent.name)) continue
        const base = ent.name.replace(/\.vue$/, '')
        const seg = base === 'index' ? '' : `/${base}`
        const routePath = `${prefix}${seg}` || '/'
        const rel = path.relative(ROOT, full).replace(/\\/g, '/')
        routes.push({ path: routePath, source: rel, kind: 'page' })
      }
    }
  }
  walk(pagesDir)
  for (const m of modulePages) routes.push({ path: m.path, source: m.source, kind: 'page' })
  const seen = new Set()
  return routes.filter((r) => {
    if (seen.has(r.path)) return false
    seen.add(r.path)
    return true
  })
}

export async function resolveDynamicRoutes(base) {
  const prisma = new PrismaClient()
  const dynamic = []
  try {
    const club = await prisma.club.findFirst({ where: { slug: 'padel-zone-tehran' } })
    const coach = await prisma.coach.findFirst()
    const booking = await prisma.booking.findFirst({ orderBy: { createdAt: 'desc' } })
    const coachSession = await prisma.coachSession.findFirst()
    const contact = await prisma.contact.findFirst()
    const packageDraft = await prisma.packageDraft.findFirst()
    const adminClub = club

    if (club) {
      dynamic.push({ path: `/clubs/${club.slug}`, source: 'app/pages/clubs/[slug].vue', kind: 'page' })
      dynamic.push({ path: `/book/court/${club.slug}`, source: 'app/pages/book/court/[slug].vue', kind: 'page' })
      dynamic.push({
        path: `/clubs/${encodeURIComponent('تهران')}/padel`,
        source: 'app/pages/clubs/[city]/[sport].vue',
        kind: 'page',
      })
    }
    if (coach) {
      dynamic.push({ path: `/coaches/${coach.id}`, source: 'app/pages/coaches/[id].vue', kind: 'page' })
      dynamic.push({ path: `/book/coach/${coach.id}`, source: 'app/pages/book/coach/[id].vue', kind: 'page' })
    }
    if (packageDraft) {
      dynamic.push({ path: `/book/package/${packageDraft.id}`, source: 'app/pages/book/package/[id].vue', kind: 'page' })
    }
    if (booking) {
      dynamic.push({ path: `/athlete/bookings/${booking.id}`, source: 'app/pages/athlete/bookings/[id].vue', kind: 'page', auth: 'athlete' })
    const payBooking = await prisma.booking.findFirst({ where: { payPin: { not: null } } })
    if (payBooking?.payPin) {
      dynamic.push({ path: `/p/${payBooking.payPin}`, source: 'app/pages/p/[pin].vue', kind: 'page' })
    }
    }
    if (coachSession) {
      dynamic.push({
        path: `/athlete/bookings/coach/${coachSession.id}`,
        source: 'app/pages/athlete/bookings/coach/[id].vue',
        kind: 'page',
        auth: 'athlete',
      })
    }
    if (contact) {
      dynamic.push({ path: `/owner/crm/${contact.id}`, source: 'app/pages/owner/crm/[id].vue', kind: 'page', auth: 'owner' })
    }
    if (adminClub) {
      dynamic.push({ path: `/admin/clubs/${adminClub.id}`, source: 'app/pages/admin/clubs/[id].vue', kind: 'page', auth: 'admin' })
    }
  } finally {
    await prisma.$disconnect()
  }

  try {
    const clubsRes = await fetch(`${base}/api/clubs`)
    if (clubsRes.ok) {
      const clubs = await clubsRes.json()
      for (const c of clubs.slice(0, 2)) {
        if (c.slug && !dynamic.some((d) => d.path === `/clubs/${c.slug}`)) {
          dynamic.push({ path: `/clubs/${c.slug}`, source: 'app/pages/clubs/[slug].vue', kind: 'page' })
        }
      }
    }
  } catch {
    // ignore
  }

  return dynamic
}

/** Modal, sheet, and mobile-only UI scenarios (beyond plain routes). */
export function uiScenarios() {
  return [
    {
      id: 'modal-auth-gate',
      path: '/',
      kind: 'modal',
      auth: 'guest',
      source: 'app/components/AuthFlowModal.vue',
      prepare: async (page) => {
        await page.locator('header.canva-home-chrome .canva-home-login').first().click({ timeout: 20_000 })
        await page.locator('.canva-gate-btn-primary').first().waitFor({ timeout: 15_000 })
      },
    },
    {
      id: 'modal-login-otp',
      path: '/login',
      kind: 'modal',
      auth: 'guest',
      source: 'app/pages/login.vue',
      prepare: async (page) => {
        await page.locator('#login-phone').fill('09121234567')
        await page.locator('button[type="submit"]').click()
        await page.locator('#login-otp').waitFor({ timeout: 15_000 })
      },
    },
    {
      id: 'sheet-club-booking-confirm',
      path: '/clubs/padel-zone-tehran',
      kind: 'sheet',
      auth: 'guest',
      source: 'app/components/CourtBookingConfirmSheet.vue',
      prepare: async (page) => {
        await page.waitForTimeout(1200)
        const slot = page.locator('.canva-club-slot-cell:not([disabled])').first()
        if (await slot.count()) await slot.click()
        const cta = page.locator('.canva-club-book-cta')
        if (await cta.isEnabled().catch(() => false)) await cta.click()
        await page.locator('.venus-modal-panel, .canva-confirm-book').first().waitFor({ timeout: 15_000 }).catch(() => {})
      },
    },
    {
      id: 'sheet-owner-more',
      path: '/owner/calendar?more=1',
      kind: 'sheet',
      auth: 'owner',
      source: 'app/components/OwnerMoreSheet.vue',
      prepare: async (page) => {
        await page.locator('.canva-more-grid').first().waitFor({ timeout: 20_000 }).catch(() => {})
      },
    },
    {
      id: 'sheet-owner-reserve',
      path: '/owner/calendar',
      kind: 'sheet',
      auth: 'owner',
      source: 'app/pages/owner/calendar.vue',
      prepare: async (page) => {
        await page.locator('.canva-cal-date-nav-label, .canva-cal-grid, .canva-empty-state').first().waitFor({ timeout: 30_000 })
        const free = page.locator('.canva-cal-grid-cell').filter({ has: page.locator('.canva-cal-grid-check') })
        if (await free.count()) {
          await free.first().click()
          await page.locator('.canva-selection-bar-btn-primary').click({ timeout: 10_000 }).catch(() => {})
          await page.locator('.venus-modal-panel').first().waitFor({ timeout: 15_000 }).catch(() => {})
        }
      },
    },
    {
      id: 'sheet-owner-account-drawer',
      path: '/owner/calendar',
      kind: 'drawer',
      auth: 'owner',
      source: 'app/components/OwnerAccountDrawer.vue',
      mobileOnly: true,
      prepare: async (page) => {
        const avatar = page.locator('button[aria-label*="حساب"], button.canva-owner-avatar, header button').first()
        if (await avatar.isVisible().catch(() => false)) await avatar.click()
        await page.locator('.canva-account-drawer').first().waitFor({ timeout: 10_000 }).catch(() => {})
      },
    },
    {
      id: 'ui-mobile-side-menu',
      path: '/owner/calendar',
      kind: 'menu',
      auth: 'owner',
      source: 'app/components/DashboardShell.vue',
      mobileOnly: true,
      prepare: async (page) => {
        const menu = page.getByRole('button', { name: /منو|menu/i }).first()
        if (await menu.isVisible().catch(() => false)) await menu.click()
        await page.waitForTimeout(400)
      },
    },
    {
      id: 'ui-athlete-bottom-nav',
      path: '/athlete/home',
      kind: 'nav',
      auth: 'athlete',
      source: 'app/components/AppBottomNav.vue',
      mobileOnly: true,
      prepare: async (page) => {
        await page.locator('.canva-athlete-bottom-nav, nav[aria-label]').first().waitFor({ timeout: 15_000 }).catch(() => {})
      },
    },
    {
      id: 'state-login-loading',
      path: '/login',
      kind: 'loading',
      auth: 'guest',
      source: 'app/pages/login.vue',
      prepare: async (page) => {
        await page.locator('#login-phone').fill('09121234567')
        await page.locator('button[type="submit"]').click()
      },
    },
    {
      id: 'state-admin-gate',
      path: '/admin',
      kind: 'empty',
      auth: 'guest',
      source: 'app/layouts/dashboard-admin.vue',
      prepare: async () => {},
    },
  ]
}

export function routeToFilename(prefix, id) {
  let slug = id.replace(/^\/+/, '').replace(/\//g, '-').replace(/[^\w-]+/g, '-').replace(/-+/g, '-')
  if (slug.startsWith(`${prefix}-`)) slug = slug.slice(prefix.length + 1)
  return `${prefix}-${slug || 'home'}.png`
}

export function pathToPageId(routePath) {
  if (routePath === '/') return 'page-home'
  return `page-${routePath.replace(/^\//, '').replace(/\//g, '-')}`
}
