/** Full Canva ↔ app frame registry (Aug 27 export). See canva-reference/MAP.md */

export const BLANK_CANVA_FILES = new Set([
  '17.png', '21.png', '26.png', '45.png', '46.png', '49.png', '50.png', '55.png', '56.png',
  '59.png', '60.png', '66.png', '67.png', '69.png', '70.png', '73.png', '74.png',
  '77.png', '78.png', '79.png', '80.png',
])

export const RULE_NOTES = {
  'chrome-required': 'Required product chrome (bottom nav, logo) — do not strip to match Canva.',
  'square-radius-expected': 'LOCKED: app uses 0–2px radius; Canva mock may look softer.',
  'no-google-expected': 'Google OAuth in Canva art only — hard-off in product (Behnaz MVP).',
  'pilot-no-coach': 'Coach paths hidden when PILOT_NO_COACH=true.',
  'pilot-no-recurring': 'Season/package/recurring sheets gated — soft-land only.',
  'dynamic-content': 'Live DB names, dates, photos differ from static Canva placeholders.',
  'grid-not-list': 'Owner Today closed state = multi-court GRID (`home page (9)`), not list-day artboard.',
  'selection-bar-not-fab': 'Reserve/Block via bottom selection bar after tap — not always-visible left FABs.',
  'overlay-artboard': 'Canva crop is list-day + sheet composite; app captures grid + live sheet.',
  'sheet-modal': 'Modal scrim/pattern and AppModal chrome may differ from flat Canva artboard.',
  'thin-frame': 'Near-empty / cream Canva artboard — structural check only.',
  'no-canva-page': 'In product but no dedicated Canva full-page frame.',
}

/** Shared owner calendar helpers (used in prepare hooks). */
export function ownerHelpers(baseUrl) {
  async function ready(page) {
    await page.goto(`${baseUrl}/owner/calendar`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.locator('.canva-cal-date-nav-label, .canva-cal-grid, .canva-empty-state').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(600)
  }

  async function clickFirstFreeSlot(page) {
    const free = page.locator('.canva-cal-grid-cell').filter({
      has: page.locator('.canva-cal-grid-check'),
    })
    if (await free.count()) {
      await free.first().click()
      return true
    }
    return false
  }

  async function clickFirstBookedSlot(page) {
    const booked = page.locator('.canva-cal-grid-cell').filter({
      has: page.locator('.canva-cal-grid-cell-bar-reserved, .canva-cal-grid-cell-bar-reserved-cash, .canva-cal-grid-cell-bar-reserved-unpaid'),
    })
    if (await booked.count()) {
      await booked.first().click()
      return true
    }
    return false
  }

  async function openReserveSheet(page) {
    await ready(page)
    if (!await clickFirstFreeSlot(page)) return
    await page.locator('.canva-selection-bar-btn-primary').click({ timeout: 10_000 })
    await page.locator('.venus-modal-panel').first().waitFor({ timeout: 15_000 })
  }

  async function openBlockSheet(page) {
    await ready(page)
    if (!await clickFirstFreeSlot(page)) return
    await page.locator('.canva-selection-bar-btn-secondary').first().click({ timeout: 10_000 })
    await page.locator('.venus-modal-panel').first().waitFor({ timeout: 15_000 })
  }

  async function openDetailSheet(page) {
    await ready(page)
    if (!await clickFirstBookedSlot(page)) return
    await page.locator('.canva-detail-row, .venus-modal-panel').first().waitFor({ timeout: 15_000 })
  }

  async function openMoreSheet(page) {
    await ready(page)
    await page.goto(`${baseUrl}/owner/calendar?more=1`, { waitUntil: 'domcontentloaded' })
    await page.locator('.canva-more-grid').first().waitFor({ timeout: 15_000 })
  }

  async function openDatePicker(page) {
    await ready(page)
    await page.locator('.canva-cal-date-nav-label').click()
    await page.locator('[role="dialog"] .jalali-calendar-owner').first().waitFor({ timeout: 20_000 })
    await page.waitForTimeout(350)
  }

  async function openOverview(page) {
    await ready(page)
    await page.getByRole('button', { name: /نمای کلی|overview/i }).click()
    await page.waitForTimeout(1200)
  }

  return {
    ready,
    clickFirstFreeSlot,
    clickFirstBookedSlot,
    openReserveSheet,
    openBlockSheet,
    openDetailSheet,
    openMoreSheet,
    openDatePicker,
    openOverview,
  }
}

export function buildFrames(baseUrl) {
  const o = ownerHelpers(baseUrl)

  return [
    // ——— Public pages ———
    { id: 'public-home', canva: 'home page.png', category: 'page', path: '/', rules: ['chrome-required', 'dynamic-content'] },
    { id: 'public-home-alt', canva: 'home page (2).png', category: 'page', path: '/', rules: ['chrome-required', 'dynamic-content'] },
    { id: 'clubs-list', canva: 'Court list.png', category: 'page', path: '/clubs', rules: ['dynamic-content'] },
    { id: 'club-detail', canva: 'home page (3).png', category: 'page', path: '/clubs/padel-zone-tehran', rules: ['dynamic-content'] },
    {
      id: 'club-confirm-sheet',
      canva: 'home page (4).png',
      category: 'sheet',
      element: 'booking-confirm',
      path: '/clubs/padel-zone-tehran',
      rules: ['dynamic-content', 'sheet-modal', 'square-radius-expected'],
      prepare: async (page) => {
        await page.waitForTimeout(1000)
        const slot = page.locator('.canva-club-slot-cell:not([disabled])').first()
        if (await slot.count()) await slot.click()
        const cta = page.locator('.canva-club-book-cta')
        if (await cta.isEnabled().catch(() => false)) await cta.click()
        await page.locator('.canva-confirm-book, .venus-modal-panel').first().waitFor({ timeout: 15_000 }).catch(() => {})
      },
    },

    // ——— Auth ———
    {
      id: 'auth-gate',
      canva: 'login_sign up.png',
      category: 'modal',
      element: 'auth-gate',
      path: '/',
      rules: ['no-google-expected', 'square-radius-expected', 'sheet-modal'],
      prepare: async (page) => {
        await page.locator('header.canva-home-chrome .canva-home-login').first().waitFor({ state: 'visible', timeout: 20_000 })
        await page.locator('header.canva-home-chrome .canva-home-login').first().click()
        await page.locator('.canva-gate-btn-primary').first().waitFor({ state: 'visible', timeout: 20_000 })
        await page.waitForTimeout(350)
      },
    },
    {
      id: 'auth-role',
      canva: '4.png',
      category: 'modal',
      element: 'auth-role',
      path: '/register',
      rules: ['pilot-no-coach', 'square-radius-expected', 'sheet-modal'],
      prepare: async (page) => {
        await page.locator('.canva-role-card').first().waitFor({ timeout: 20_000 })
      },
    },
    {
      id: 'auth-login-phone',
      canva: '5.png',
      category: 'modal',
      element: 'auth-login-otp',
      path: '/login',
      rules: ['square-radius-expected', 'sheet-modal'],
      prepare: async (page) => {
        await page.locator('#login-phone, .canva-gate-btn-secondary').first().waitFor({ timeout: 15_000 })
      },
    },
    { id: 'auth-login-phone-b', canva: '6.png', category: 'modal', element: 'auth-login-otp', path: '/login', rules: ['square-radius-expected', 'sheet-modal'],
      prepare: async (page) => { await page.locator('#login-phone').waitFor({ timeout: 15_000 }) } },
    { id: 'auth-register-flow', canva: '7.png', category: 'modal', element: 'auth-register', path: '/register?role=athlete',
      rules: ['pilot-no-coach', 'square-radius-expected', 'sheet-modal'],
      prepare: async (page) => { await page.locator('input, .canva-gate-btn-primary').first().waitFor({ timeout: 15_000 }) } },
    { id: 'auth-variant-8', canva: '8.png', category: 'modal', element: 'auth-flow', path: '/login', rules: ['square-radius-expected', 'sheet-modal'] },
    { id: 'auth-variant-9', canva: '9.png', category: 'modal', element: 'auth-flow', path: '/login', rules: ['square-radius-expected', 'sheet-modal'] },
    { id: 'auth-variant-10', canva: '10.png', category: 'modal', element: 'auth-flow', path: '/register?role=owner', rules: ['square-radius-expected', 'sheet-modal'] },
    { id: 'auth-variant-11', canva: '11.png', category: 'modal', element: 'auth-flow', path: '/register?role=owner', rules: ['pilot-no-coach', 'square-radius-expected', 'sheet-modal'] },
    { id: 'auth-variant-12', canva: '12.png', category: 'modal', element: 'auth-otp', path: '/login', rules: ['square-radius-expected', 'sheet-modal'],
      prepare: async (page) => {
        await page.locator('#login-phone').fill('09121234567')
        await page.locator('button[type="submit"]').click()
        await page.locator('#login-otp').waitFor({ timeout: 15_000 })
      },
    },
    { id: 'auth-variant-13', canva: '13.png', category: 'modal', element: 'auth-otp', path: '/login', rules: ['square-radius-expected', 'sheet-modal'],
      prepare: async (page) => {
        await page.locator('#login-phone').fill('09121234567')
        await page.locator('button[type="submit"]').click()
        await page.locator('#login-otp').waitFor({ timeout: 15_000 })
      },
    },
    { id: 'auth-variant-14', canva: '14.png', category: 'modal', element: 'auth-register-owner', path: '/register?role=owner', rules: ['square-radius-expected', 'sheet-modal'] },
    { id: 'auth-variant-15', canva: '15.png', category: 'modal', element: 'auth-flow', path: '/register?role=owner', rules: ['square-radius-expected', 'sheet-modal'] },
    { id: 'auth-variant-16', canva: '16.png', category: 'modal', element: 'auth-welcome', path: '/login', rules: ['square-radius-expected', 'sheet-modal'] },

    // ——— Athlete ———
    { id: 'athlete-home', canva: 'home page (8).png', category: 'page', path: '/athlete/home', auth: 'athlete', rules: ['chrome-required', 'dynamic-content'] },
    { id: 'athlete-hub', canva: 'home page (5).png', category: 'page', path: '/athlete', auth: 'athlete', rules: ['chrome-required'] },
    { id: 'athlete-favorites', canva: 'home page (6).png', category: 'page', path: '/athlete/favorites', auth: 'athlete', rules: ['dynamic-content'] },
    { id: 'athlete-bookings', canva: 'home page (7).png', category: 'page', path: '/athlete/bookings', auth: 'athlete', rules: ['dynamic-content'] },

    // ——— Owner calendar (pages + sheets) ———
    { id: 'owner-calendar-grid', canva: 'home page (9).png', category: 'page', path: '/owner/calendar', auth: 'owner',
      rules: ['grid-not-list', 'dynamic-content', 'selection-bar-not-fab'] },
    { id: 'owner-calendar-grid-b', canva: 'home page (13).png', category: 'page', path: '/owner/calendar', auth: 'owner',
      rules: ['grid-not-list', 'dynamic-content', 'selection-bar-not-fab'] },
    { id: 'owner-calendar-overview', canva: 'changed.png', category: 'page', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content'], prepare: (page) => o.openOverview(page) },
    { id: 'owner-desk-reserve-a', canva: 'home page (10).png', category: 'sheet', element: 'desk-reserve', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content', 'overlay-artboard', 'sheet-modal'], prepare: (page) => o.openReserveSheet(page) },
    { id: 'owner-desk-reserve-b', canva: 'home page (18).png', category: 'sheet', element: 'desk-reserve', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content', 'overlay-artboard', 'sheet-modal'], prepare: (page) => o.openReserveSheet(page) },
    { id: 'owner-desk-recurring', canva: 'home page (11).png', category: 'sheet', element: 'desk-recurring', path: '/owner/calendar', auth: 'owner',
      rules: ['pilot-no-recurring', 'overlay-artboard', 'sheet-modal'], prepare: (page) => o.openReserveSheet(page) },
    { id: 'owner-desk-pay-a', canva: 'home page (12).png', category: 'sheet', element: 'desk-pay-confirm', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content', 'overlay-artboard', 'sheet-modal'], prepare: (page) => o.openReserveSheet(page) },
    { id: 'owner-desk-pay-b', canva: 'home page (19).png', category: 'sheet', element: 'desk-pay-confirm', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content', 'overlay-artboard', 'sheet-modal'], prepare: (page) => o.openReserveSheet(page) },
    { id: 'owner-desk-detail-a', canva: 'home page (14).png', category: 'sheet', element: 'desk-detail', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content', 'overlay-artboard', 'sheet-modal'], prepare: (page) => o.openDetailSheet(page) },
    { id: 'owner-desk-detail-b', canva: 'home page (22).png', category: 'sheet', element: 'desk-detail', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content', 'overlay-artboard', 'sheet-modal'], prepare: (page) => o.openDetailSheet(page) },
    { id: 'owner-desk-cancel-a', canva: 'home page (15).png', category: 'sheet', element: 'desk-cancel', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content', 'overlay-artboard', 'sheet-modal'], prepare: async (page) => {
        await o.openDetailSheet(page)
        const btn = page.locator('.canva-detail-cancel')
        if (await btn.isVisible().catch(() => false)) await btn.click()
      } },
    { id: 'owner-desk-cancel-b', canva: 'home page (16).png', category: 'sheet', element: 'desk-cancel', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content', 'overlay-artboard', 'sheet-modal'], prepare: async (page) => {
        await o.openDetailSheet(page)
        const btn = page.locator('.canva-detail-cancel')
        if (await btn.isVisible().catch(() => false)) await btn.click()
      } },
    { id: 'owner-desk-free-menu', canva: 'home page (17).png', category: 'sheet', element: 'free-slot-menu', path: '/owner/calendar', auth: 'owner',
      rules: ['selection-bar-not-fab', 'overlay-artboard', 'sheet-modal'], prepare: async (page) => {
        await o.ready(page)
        await o.clickFirstFreeSlot(page)
        await page.locator('.canva-selection-bar').waitFor({ timeout: 10_000 })
      } },
    { id: 'owner-desk-note', canva: 'home page (20).png', category: 'sheet', element: 'desk-note', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content', 'overlay-artboard', 'sheet-modal'], prepare: async (page) => {
        await o.openDetailSheet(page)
        const note = page.locator('.canva-detail-note')
        if (await note.isVisible().catch(() => false)) await note.click()
      } },
    { id: 'owner-desk-block', canva: 'home page (21).png', category: 'sheet', element: 'desk-block', path: '/owner/calendar', auth: 'owner',
      rules: ['dynamic-content', 'overlay-artboard', 'sheet-modal'], prepare: (page) => o.openBlockSheet(page) },
    { id: 'owner-overlay-23', canva: 'home page (23).png', category: 'overlay', path: '/owner/calendar', auth: 'owner',
      rules: ['overlay-artboard', 'grid-not-list'], prepare: (page) => o.openDetailSheet(page) },
    { id: 'owner-overlay-24', canva: 'home page (24).png', category: 'overlay', path: '/owner/calendar', auth: 'owner',
      rules: ['overlay-artboard'], prepare: (page) => o.openReserveSheet(page) },
    { id: 'owner-overlay-25', canva: 'home page (25).png', category: 'overlay', path: '/owner/calendar', auth: 'owner',
      rules: ['overlay-artboard'], prepare: (page) => o.openBlockSheet(page) },
    { id: 'owner-overlay-27', canva: 'home page (27).png', category: 'overlay', path: '/owner/calendar', auth: 'owner',
      rules: ['overlay-artboard'], prepare: (page) => o.openDatePicker(page) },
    { id: 'owner-overlay-42', canva: 'home page (42).png', category: 'overlay', path: '/owner/calendar', auth: 'owner',
      rules: ['overlay-artboard'], prepare: (page) => o.openMoreSheet(page) },

    // ——— Owner More / secondary ———
    { id: 'owner-more-a', canva: 'home page (29).png', category: 'sheet', element: 'more-menu', path: '/owner/calendar?more=1', auth: 'owner',
      rules: ['pilot-no-coach', 'sheet-modal'], prepare: async (page) => { await page.locator('.canva-more-grid').first().waitFor({ timeout: 15_000 }) } },
    { id: 'owner-more-b', canva: 'home page (32).png', category: 'sheet', element: 'more-menu', path: '/owner/calendar?more=1', auth: 'owner',
      rules: ['pilot-no-coach', 'sheet-modal'], prepare: async (page) => { await page.locator('.canva-more-grid').first().waitFor({ timeout: 15_000 }) } },
    { id: 'owner-more-support', canva: 'home page (38).png', category: 'page', path: '/owner/support', auth: 'owner', rules: ['dynamic-content'] },

    // ——— Owner finance / CRM / settings / equipments ———
    { id: 'owner-finance', canva: 'home page (26).png', category: 'page', path: '/owner/finance', auth: 'owner', rules: ['dynamic-content'] },
    {
      id: 'owner-finance-txn',
      canva: 'جزییات بازیکن.png',
      category: 'sheet',
      element: 'finance-txn',
      path: '/owner/finance',
      auth: 'owner',
      rules: ['dynamic-content', 'sheet-modal'],
      prepare: async (page) => {
        await page.waitForTimeout(1200)
        const card = page.locator('.canva-finance-tx-card').first()
        if (await card.count()) await card.click()
        await page.locator('.venus-modal-panel, .canva-detail-row').first().waitFor({ timeout: 12_000 }).catch(() => {})
      },
    },
    { id: 'owner-finance-report', canva: 'گزارش پیشرفته.png', category: 'page', path: '/owner/finance/report', auth: 'owner', rules: ['dynamic-content'] },
    { id: 'owner-crm', canva: 'home page (28).png', category: 'page', path: '/owner/crm', auth: 'owner', rules: ['dynamic-content'] },
    {
      id: 'owner-crm-sms-a',
      canva: 'کمپین پیامکی جدید.png',
      category: 'sheet',
      element: 'crm-sms-wizard',
      path: '/owner/crm',
      auth: 'owner',
      rules: ['dynamic-content', 'sheet-modal'],
      prepare: async (page) => {
        const start = page.getByRole('button', { name: /پیامک|SMS|کمپین|campaign/i }).first()
        if (await start.isVisible().catch(() => false)) await start.click()
        await page.waitForTimeout(800)
      },
    },
    { id: 'owner-crm-sms-b', canva: 'کمپین پیامکی جدید (2).png', category: 'sheet', element: 'crm-sms-wizard', path: '/owner/crm', auth: 'owner', rules: ['dynamic-content', 'sheet-modal'] },
    { id: 'owner-crm-sms-c', canva: 'کمپین پیامکی جدید (3).png', category: 'sheet', element: 'crm-sms-wizard', path: '/owner/crm', auth: 'owner', rules: ['dynamic-content', 'sheet-modal'] },
    { id: 'owner-equipments', canva: 'home page (30).png', category: 'page', path: '/owner/equipments', auth: 'owner', rules: ['dynamic-content'] },
    {
      id: 'owner-equipments-edit',
      canva: 'home page (31).png',
      category: 'sheet',
      element: 'equipments-edit',
      path: '/owner/equipments',
      auth: 'owner',
      rules: ['dynamic-content', 'sheet-modal', 'thin-frame'],
      prepare: async (page) => {
        await page.waitForTimeout(1000)
        const edit = page.locator('button, a').filter({ hasText: /ویرایش|edit/i }).first()
        if (await edit.isVisible().catch(() => false)) await edit.click()
        await page.waitForTimeout(800)
      },
    },
    { id: 'owner-settings', canva: 'افزودن زمین.png', category: 'page', path: '/owner/settings', auth: 'owner', rules: ['dynamic-content'] },
    { id: 'owner-discounts', canva: 'home page (33).png', category: 'page', path: '/owner/discounts', auth: 'owner', rules: ['dynamic-content', 'thin-frame'] },

    // ——— Thin / new Aug 27 frames (best-effort route) ———
    { id: 'owner-frame-39', canva: 'home page (39).png', category: 'page', path: '/owner/settings', auth: 'owner', rules: ['dynamic-content', 'thin-frame'] },
    { id: 'owner-frame-40', canva: 'home page (40).png', category: 'page', path: '/owner/workers', auth: 'owner', rules: ['dynamic-content', 'thin-frame'] },
    { id: 'owner-frame-41', canva: 'home page (41).png', category: 'page', path: '/owner/notifications', auth: 'owner', rules: ['dynamic-content', 'thin-frame'] },
    { id: 'owner-frame-43', canva: 'home page (43).png', category: 'page', path: '/owner/pending', auth: 'owner', rules: ['dynamic-content', 'thin-frame'] },
    { id: 'owner-frame-34', canva: 'home page (34).png', category: 'overlay', path: '/owner/calendar', auth: 'owner', rules: ['overlay-artboard', 'thin-frame'], prepare: (p) => o.openDatePicker(p) },
    { id: 'owner-frame-35', canva: 'home page (35).png', category: 'overlay', path: '/owner/calendar', auth: 'owner', rules: ['overlay-artboard', 'thin-frame'], prepare: (p) => o.openMoreSheet(p) },
    { id: 'owner-frame-36', canva: 'home page (36).png', category: 'sheet', path: '/owner/calendar', auth: 'owner', rules: ['overlay-artboard', 'thin-frame'], prepare: (p) => o.openReserveSheet(p) },
    { id: 'owner-frame-37', canva: 'home page (37).png', category: 'sheet', path: '/owner/calendar', auth: 'owner', rules: ['overlay-artboard', 'thin-frame'], prepare: (p) => o.openDetailSheet(p) },
    { id: 'owner-frame-44', canva: 'home page (44).png', category: 'page', path: '/owner/setup', auth: 'owner', rules: ['thin-frame'] },
    { id: 'owner-frame-45', canva: 'home page (45).png', category: 'page', path: '/owner/calendar', auth: 'owner', rules: ['thin-frame', 'grid-not-list'] },
  ]
}
