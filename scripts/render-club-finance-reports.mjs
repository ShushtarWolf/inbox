/**
 * Render docs/club-finance-reports/*-report.html → PDF (Playwright + Vazirmatn).
 */
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'docs/club-finance-reports')
const files = [
  { html: 'iust-report.html', pdf: 'iust-report.pdf' },
  { html: 'takhti-report.html', pdf: 'takhti-report.pdf' },
]

const browser = await chromium.launch({ headless: true })
try {
  for (const f of files) {
    const htmlPath = path.join(dir, f.html)
    const pdfPath = path.join(dir, f.pdf)
    const page = await browser.newPage()
    page.setDefaultTimeout(60_000)
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
    // Wait for Vazirmatn to load
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready
    })
    await page.waitForTimeout(400)
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
      preferCSSPageSize: true,
    })
    await page.close()
    console.log(`Wrote ${pdfPath}`)
  }
}
finally {
  await browser.close()
}
