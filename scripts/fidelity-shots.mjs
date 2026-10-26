// Usage: node scripts/fidelity-shots.mjs id:route [id:route ...]  (env WHICH=html,after,live)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const SOT = 'file://' + path.resolve('design-reference/sot/inbox-all-pages.html')
const which = (process.env.WHICH || 'html,after,live').split(',')
const vps = [['375', 375, 812], ['desktop', 1440, 900]]
const b = await chromium.launch({ executablePath: process.env.CHROME || '/home/box/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell' })
for (const arg of process.argv.slice(2)) {
  const [id, routes] = [arg.slice(0, arg.indexOf(':')), arg.slice(arg.indexOf(':') + 1)]
  const [route, liveRoute = route] = routes.split('@')
  const dir = `design-reference/comparisons/${id}`; fs.mkdirSync(dir, { recursive: true })
  for (const [tag, w, h] of vps) {
    for (const kind of which) {
      if (kind !== 'html' && !route) continue
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'fa-IR' })
      const p = await ctx.newPage()
      try {
        if (kind === 'html') {
          await p.goto(SOT, { waitUntil: 'load', timeout: 60000 })
          const sotId = id.split('--')[0]
          await p.evaluate((i) => { const f = (window._NAVG||[]).flatMap(g=>g.items||g[1]||[]).find(x=>(x.id||x[0])===i); if (f && f.flow) eval(f.flow); else go(i) }, sotId).catch(async () => { await p.evaluate((i) => go(i), sotId) })
          await p.evaluate(() => { const pr = document.querySelector('.proto'); if (pr) pr.style.display = 'none'; window.scrollTo(0, 0) })
        } else {
          const base = kind === 'after' ? 'http://localhost:3100' : 'https://inboxs.ir'
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
