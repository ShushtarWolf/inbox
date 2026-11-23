#!/usr/bin/env node
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const base = process.env.BASE_URL || 'http://localhost:3000'
const outDir = '/opt/cursor/artifacts'
const splitId = process.env.OPEN_MATCH_SPLIT_ID || 'cmwt2ytil000ejsle9sqa8nw6'
const hostId = process.env.OPEN_MATCH_HOST_ID || 'cmwt2ytiq000kjslepbp0qr2z'
const completedId = process.env.OPEN_MATCH_COMPLETED_ID || 'cmwt2ytiv000sjslemi94kprk'
const previewPhone = process.env.PREVIEW_ATHLETE_PHONE || '09120000111'

async function loginAthlete(request) {
  const req = await request.post(`${base}/api/auth/otp/request`, {
    data: { phone: previewPhone, purpose: 'login' },
  })
  if (!req.ok()) throw new Error(`otp request ${req.status()}`)
  const reqData = await req.json()
  if (!reqData.debugCode) throw new Error('missing debugCode — set SMS_PROVIDER=log')
  const ver = await request.post(`${base}/api/auth/otp/verify`, {
    data: {
      phone: reqData.phone || previewPhone,
      code: reqData.debugCode,
      purpose: 'login',
    },
  })
  if (!ver.ok()) throw new Error(`otp verify ${ver.status()}`)
}

async function shot(page, name, url, opts = {}) {
  await page.goto(url, { waitUntil: 'networkidle' })
  if (opts.click) await opts.click(page)
  if (opts.wait) await page.waitForTimeout(opts.wait)
  await page.screenshot({
    path: `${outDir}/${name}.png`,
    fullPage: opts.fullPage ?? true,
  })
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })

  const desktopCtx = await browser.newContext({
    locale: 'fa-IR',
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  })
  await loginAthlete(desktopCtx.request)
  const desktop = await desktopCtx.newPage()

  const storage = await desktopCtx.storageState()
  const mobileCtx = await browser.newContext({
    locale: 'fa-IR',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 2,
    storageState: storage,
  })
  const mobile = await mobileCtx.newPage()

  await shot(desktop, 'open-match-01-list-desktop-rtl', `${base}/athlete/open-match`)
  await shot(mobile, 'open-match-01-list-mobile-rtl', `${base}/athlete/open-match`)

  await desktop.goto(`${base}/athlete/open-match/${splitId}?previewAssess=1`, { waitUntil: 'networkidle' })
  await desktop.getByRole('button', { name: /پیوستن/ }).waitFor({ timeout: 15000 }).catch(() => {})
  await desktop.waitForTimeout(800)
  await desktop.screenshot({ path: `${outDir}/open-match-02-assessment-modal.png`, fullPage: true })

  const inputs = desktop.locator('.app-modal-body input[type="number"]')
  await inputs.first().waitFor({ timeout: 15000 })
  await inputs.nth(0).fill('5')
  await inputs.nth(1).fill('12')
  await inputs.nth(2).fill('4')
  await inputs.nth(3).fill('4')
  await desktop.getByRole('button', { name: /تکمیل ارزیابی/ }).click()
  await desktop.waitForTimeout(2500)
  await shot(desktop, 'open-match-02b-skill-badge-list', `${base}/athlete/open-match`, { wait: 800 })

  await shot(desktop, 'open-match-03-create-flow', `${base}/athlete/open-match/new`)
  await shot(desktop, 'open-match-04-detail-split-online', `${base}/athlete/open-match/${splitId}`)
  await shot(desktop, 'open-match-05-detail-host-pays', `${base}/athlete/open-match/${hostId}`)
  await shot(desktop, 'open-match-06-post-match-peer-rating', `${base}/athlete/open-match/${completedId}`)

  await browser.close()
  console.log(`Saved screenshots under ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})