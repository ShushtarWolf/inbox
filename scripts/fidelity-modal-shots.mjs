import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/home/box/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell' })
for (const a of process.argv.slice(2)) { const [id, route] = a.split(':')
 for (const [tag,w,h] of [['desktop',1440,900],['375',375,812]]) {
  const c = await b.newContext({ viewport:{width:w,height:h}, locale:'fa-IR' }); const p = await c.newPage()
  await p.goto('http://localhost:3000'+route,{waitUntil:'load'}); await p.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{}); await p.waitForTimeout(2500)
  await p.screenshot({ path:`design-reference/comparisons/${id}/after-${id}-${tag}.png` }); console.log(id,tag,p.url()); await c.close() } }
await b.close()
