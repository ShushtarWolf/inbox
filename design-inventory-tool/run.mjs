#!/usr/bin/env node
/**
 * Full design inventory pipeline: requires dev server at BASE_URL (default :3000).
 * Usage: node design-inventory-tool/run.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCapture } from './capture.mjs'
import { buildHtml } from './build-html.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE_URL || 'http://localhost:3000'

async function waitForHealth(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${url}/api/health`)
      if (res.ok) {
        const body = await res.json()
        if (body.ok) return true
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

async function main() {
  const healthOk = await waitForHealth(BASE, 3)
  let child
  if (!healthOk) {
    console.log('Starting Nuxt dev server…')
    child = spawn('npm', ['run', 'dev'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, TMPDIR: '/tmp' },
    })
    const ready = await waitForHealth(BASE, 90)
    if (!ready) {
      child.kill()
      throw new Error('Dev server did not become healthy')
    }
  }

  try {
    const manifest = await runCapture()
    const html = await buildHtml()
    const report = {
      html: html.htmlPath,
      htmlSizeMb: html.sizeMb,
      htmlLite: html.litePath,
      desktopDir: path.join(ROOT, 'design-inventory/desktop'),
      mobileDir: path.join(ROOT, 'design-inventory/mobile'),
      pagesDesktop: html.counts.pagesDesktop,
      pagesMobile: html.counts.pagesMobile,
      componentsDesktop: html.counts.compDesktop,
      componentsMobile: html.counts.compMobile,
      skipped: manifest.skipped,
    }
    fs.writeFileSync(path.join(ROOT, 'design-inventory-tool/results/report.json'), JSON.stringify(report, null, 2))
    console.log('\n=== Design inventory complete ===')
    console.log(JSON.stringify(report, null, 2))
  } finally {
    if (child) child.kill('SIGTERM')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
