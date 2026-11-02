/**
 * Render docs/money-system-map-fa.html → docs/money-system-map-fa.pdf
 * Needs network for Mermaid CDN + Playwright Chromium.
 */
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const htmlPath = path.join(root, 'docs/money-system-map-fa.html')
const pdfPath = path.join(root, 'docs/money-system-map-fa.pdf')
const url = pathToFileURL(htmlPath).href

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(120_000)

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.documentElement.dataset.mermaidReady === '1', null, {
  timeout: 90_000,
})
// Let SVG layout settle
await page.waitForTimeout(800)

const svgCount = await page.locator('.mermaid svg').count()
if (svgCount < 5) {
  await browser.close()
  throw new Error(`Expected ≥5 mermaid SVGs, got ${svgCount}`)
}

await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
  preferCSSPageSize: true,
})

await browser.close()
console.log(`Wrote ${pdfPath} (${svgCount} diagrams)`)
