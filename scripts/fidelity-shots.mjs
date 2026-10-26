// Usage: node scripts/fidelity-shots.mjs id:route [id:route ...]  (env WHICH=html,after,live)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const SOT = 'file://' + path.resolve('design-reference/sot/inbox-all-pages.html')
const which = (process.env.WHICH || 'html,after,live').split(',')
const vps = [['375', 375, 812], ['desktop', 1440, 900]]
let STATE
const b = await chromium.launch({ executablePath: process.env.CHROME || '/home/box/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell' })
// LOGIN_OTP / LOGIN log into the LOCAL dev DB once (seed users); live stays anonymous/read-only.
const SF = `/tmp/fid-state-${process.env.LOGIN_OTP || process.env.LOGIN}.json`
const fs_ = await import('node:fs')
if ((process.env.LOGIN_OTP || process.env.LOGIN) && fs_.existsSync(SF)) STATE = JSON.parse(fs_.readFileSync(SF, 'utf8'))
else if (process.env.LOGIN_OTP || process.env.LOGIN) {
  const c = await b.newContext(); const base = 'http://localhost:3100'
  if (process.env.LOGIN_OTP) {
    const r = await (await c.request.post(base + '/api/auth/otp/request', { data: { phone: process.env.LOGIN_OTP, purpose: 'login' } })).json()
    await c.request.post(base + '/api/auth/otp/verify', { data: { phone: process.env.LOGIN_OTP, code: r.debugCode, purpose: 'login' } })
  } else await c.request.post(base + '/api/auth/login', { data: { email: process.env.LOGIN, password: process.env.LOGIN_PW || 'demo1234' } })
  STATE = await c.storageState(); await c.close(); fs_.writeFileSync(SF, JSON.stringify(STATE))
}
for (const arg of process.argv.slice(2)) {
  const [id, routes] = [arg.slice(0, arg.indexOf(':')), arg.slice(arg.indexOf(':') + 1)]
  const [route, liveRoute = route] = routes.split('@')
  const dir = `design-reference/comparisons/${id}`; fs.mkdirSync(dir, { recursive: true })
  for (const [tag, w, h] of vps) {
    for (const kind of which) {
      if (kind !== 'html' && !route) continue
      const ctx = await b.newContext({ ...(kind === 'after' && STATE ? { storageState: STATE } : {}), viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'fa-IR' })
      const p = await ctx.newPage()
      try {
        if (kind === 'html') {
          await p.goto(SOT, { waitUntil: 'load', timeout: 60000 })
          const sotId = id.split('--')[0]
          await p.evaluate((i) => { const f = (window._NAVG||[]).flatMap(g=>g.items||g[1]||[]).find(x=>(x.id||x[0])===i); if (f && f.flow) eval(f.flow); else go(i) }, sotId).catch(async () => { await p.evaluate((i) => go(i), sotId) })
          await p.evaluate(() => { const pr = document.querySelector('.proto'); if (pr) pr.style.display = 'none'; window.scrollTo(0, 0) })
        } else {
          const base = kind === 'after' ? 'http://localhost:3100' : 'https://inboxs.ir'
          // LOGIN=phone logs into the LOCAL dev DB only (seed users, demo1234); live stays anonymous/read-only.
          await p.goto(base + (kind === 'live' ? liveRoute : route), { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {})
        }
        await p.waitForTimeout(1500)
        const full = await p.evaluate(() => document.documentElement.scrollHeight)
        await p.screenshot({ path: `${dir}/${kind}-${id}-${tag}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(full, h * 3) } })
        console.log('ok', kind, id, tag)
      } catch (e) { console.log('FAIL', kind, id, tag, e.message.split('\n')[0]) }
      await ctx.close()
    }
  }
}
await b.close()
