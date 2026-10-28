// Admin shots: unlocks the memory-only admin gate with ADMIN_PROVISION_SECRET from .env (never logged), then SPA-navigates.
// Usage: LOGIN=manager@inbox.local node scripts/fidelity-admin-shots.mjs id:route ...
import { chromium } from 'playwright'; import fs from 'node:fs'
const env = fs.readFileSync('.env', 'utf8'); const SECRET = (env.match(/^ADMIN_PROVISION_SECRET=["']?([^"'\n]*)/m) || [])[1]
if (!SECRET) { console.log('no ADMIN_PROVISION_SECRET'); process.exit(1) }
const SF = `/tmp/fid-state-${process.env.LOGIN}.json`; const STATE = fs.existsSync(SF) ? JSON.parse(fs.readFileSync(SF, 'utf8')) : undefined
const b = await chromium.launch({ executablePath: '/home/box/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell' })
for (const [tag, w, h] of [['desktop', 1440, 900], ['375', 375, 812]]) {
  const ctx = await b.newContext({ storageState: STATE, viewport: { width: w, height: h }, locale: 'fa-IR' }); const p = await ctx.newPage()
  await p.goto('http://localhost:3000/admin', { waitUntil: 'networkidle' }).catch(() => {})
  await p.locator('input[type=password], input').first().fill(SECRET); await p.keyboard.press('Enter'); await p.waitForTimeout(2500)
  for (const a of process.argv.slice(2)) {
    const [id, route] = [a.slice(0, a.indexOf(':')), a.slice(a.indexOf(':') + 1)]
    fs.mkdirSync(`design-reference/comparisons/${id}`, { recursive: true })
    await p.evaluate((r) => document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push(r), route)
    await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(2500)
    const gate = await p.locator('input[type=password]').count()
    const out = `design-reference/comparisons/${id}/after-${id}-${tag}.png`
    await p.addStyleTag({ content: 'nuxt-devtools-frame,#nuxt-devtools-container{display:none!important}' })
    await p.screenshot({ path: out, fullPage: true }); console.log(gate ? 'GATE' : 'ok', id, tag, new URL(p.url()).pathname)
  }
  await ctx.close()
}
await b.close()
