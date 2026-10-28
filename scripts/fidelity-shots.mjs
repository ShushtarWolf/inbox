// Usage: node scripts/fidelity-shots.mjs id:route[@liveRoute] ...   env WHICH=html,after,live
// Rules (design-reference/GAPS.md "Capture pipeline"):
//  - full-page capture (scroll height, capped at MAXH), never a single viewport clip
//  - SoT HTML is desktop-only except `m-*` pages → html-*-375 is ONLY captured for m-* ids
//    (and m-* pages are only captured at 375). Everything else: SoT desktop only, labelled.
//  - every PNG is checked (scripts/fidelity-check.py); blank / near-flat / tiny shots are deleted, not kept
//  - if the final URL differs from the requested route (redirect, e.g. coach under PILOT_NO_COACH,
//    or auth gate), the shot is NOT saved and the redirect is logged as `ENV`.
//  - ids listed in SKIP are environment-limited and never shot (admin w/o seed, coach under PILOT, pay/confirm writes)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const SOT = 'file://' + path.resolve('design-reference/sot/inbox-all-pages.html')
const which = (process.env.WHICH || 'html,after,live').split(',')
const MAXH = Number(process.env.MAXH || 6000)
const SKIP = { admin: 'no admin seed', 'pay-link': 'needs real payment write', confirm: 'needs booking write' }
const log = []
let STATE
const b = await chromium.launch({ executablePath: process.env.CHROME || '/home/box/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell' })
const SF = `/tmp/fid-state-${process.env.LOGIN_OTP || process.env.LOGIN}.json`
if ((process.env.LOGIN_OTP || process.env.LOGIN) && fs.existsSync(SF)) STATE = JSON.parse(fs.readFileSync(SF, 'utf8'))
else if (process.env.LOGIN_OTP || process.env.LOGIN) {
  const c = await b.newContext(); const base = (process.env.BASE||'http://localhost:3000')
  if (process.env.LOGIN_OTP) {
    const r = await (await c.request.post(base + '/api/auth/otp/request', { data: { phone: process.env.LOGIN_OTP, purpose: 'login' } })).json()
    await c.request.post(base + '/api/auth/otp/verify', { data: { phone: process.env.LOGIN_OTP, code: r.debugCode, purpose: 'login' } })
  } else await c.request.post(base + '/api/auth/login', { data: { email: process.env.LOGIN, password: process.env.LOGIN_PW || 'demo1234' } })
  STATE = await c.storageState(); await c.close(); fs.writeFileSync(SF, JSON.stringify(STATE))
}
for (const arg of process.argv.slice(2)) {
  const id = arg.slice(0, arg.indexOf(':')); const routes = arg.slice(arg.indexOf(':') + 1)
  const [route, liveRoute = route] = routes.split('@')
  const sotId = id.split('--')[0]
  if (SKIP[sotId]) { log.push(['ENV', id, '*', '*', SKIP[sotId]]); continue }
  const dir = `design-reference/comparisons/${id}`; fs.mkdirSync(dir, { recursive: true })
  const mobileOnly = sotId.startsWith('m-')
  const vps = mobileOnly ? [['375', 375, 812]] : [['375', 375, 812], ['desktop', 1440, 900]]
  for (const [tag, w, h] of vps) {
    for (const kind of which) {
      const out = `${dir}/${kind}-${id}-${tag}.png`
      if (fs.existsSync(out)) fs.unlinkSync(out) // never leave a stale shot behind
      if (kind === 'html' && tag === '375' && !mobileOnly) { log.push(['NO-SOT', id, kind, tag, 'SoT has no 375 layout for this screen']); continue }
      if (kind !== 'html' && !route) continue
      const ctx = await b.newContext({ ...(kind === 'after' && STATE ? { storageState: STATE } : {}), viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'fa-IR' })
      const p = await ctx.newPage()
      try {
        if (kind === 'html') {
          await p.goto(SOT, { waitUntil: 'load', timeout: 60000 })
          const ok = await p.evaluate((i) => { if (!document.getElementById('pg-' + i)) return false; go(i); return true }, sotId)
          if (!ok) { log.push(['NO-SOT', id, kind, tag, 'no #pg-' + sotId]); await ctx.close(); continue }
          await p.addStyleTag({ content: '.proto,.cv-nav{display:none!important}' })
          await p.waitForTimeout(800)
          const el = p.locator(mobileOnly ? `#pg-${sotId} .mphone` : `#pg-${sotId}`)
          await el.screenshot({ path: out })
        } else {
          const base = kind === 'after' ? (process.env.BASE||'http://localhost:3000') : 'https://inboxs.ir'
          const want = kind === 'live' ? liveRoute : route
          await p.goto(base + want, { waitUntil: 'load', timeout: 60000 }).catch(() => {})
          await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(1500)
          const got = new URL(p.url()).pathname
          if (got.replace(/\/$/, '') !== want.split('?')[0].replace(/\/$/, '')) { log.push(['ENV', id, kind, tag, `redirect ${want} → ${got}`]); await ctx.close(); continue }
          await p.addStyleTag({ content: 'nuxt-devtools-frame,#nuxt-devtools-container,vite-error-overlay,nuxt-error-overlay{display:none!important}' }).catch(() => {})
          // scroll to bottom so lazy images load, then back up
          await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) } window.scrollTo(0, 0) })
          if (await p.locator("iframe").count()) { await p.evaluate(() => document.querySelectorAll("iframe[loading=lazy]").forEach(f => f.loading = "eager")); await p.waitForTimeout(4000) }
          await p.waitForTimeout(800)
          const full = await p.evaluate(() => document.documentElement.scrollHeight)
          await p.screenshot({ path: out, fullPage: full <= MAXH, ...(full > MAXH ? { clip: { x: 0, y: 0, width: w, height: MAXH } } : {}) })
        }
        const verdict = execFileSync('python3', ['scripts/fidelity-check.py', out]).toString().trim()
        if (verdict.startsWith('REJECT')) { fs.unlinkSync(out); log.push(['REJECT', id, kind, tag, verdict]) } else log.push(['ok', id, kind, tag, verdict])
      } catch (e) { log.push(['FAIL', id, kind, tag, e.message.split('\n')[0]]) }
      await ctx.close()
    }
  }
}
await b.close()
for (const l of log) console.log(l.join('\t'))
fs.appendFileSync('/tmp/fidelity-shots.log', log.map(l => l.join('\t')).join('\n') + '\n')
