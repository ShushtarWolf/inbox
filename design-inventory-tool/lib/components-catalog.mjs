import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function discoverVueComponents() {
  const dirs = [
    path.join(ROOT, 'app/components'),
    path.join(ROOT, 'app/components/owner'),
  ]
  const out = []
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.name.endsWith('.vue')) continue
      const rel = path.relative(ROOT, path.join(dir, ent.name)).replace(/\\/g, '/')
      out.push({ name: ent.name.replace(/\.vue$/, ''), source: rel })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Harness shots: CSS utility classes from main.css @layer components. */
export function harnessShots() {
  const mainCss = fs.readFileSync(path.join(ROOT, 'app/assets/css/main.css'), 'utf8')
  const layer = mainCss.match(/@layer components \{([\s\S]*?)\n\}/)?.[1] || mainCss
  const classes = [...layer.matchAll(/^\s+\.([a-zA-Z0-9_-]+)(?:[,\s{])/gm)].map((m) => m[1])
  const unique = [...new Set(classes)]

  const buttons = unique.filter((c) => c.startsWith('btn-'))
  const inputs = unique.filter((c) => c.includes('input') || c.includes('select') || c.includes('textarea'))
  const cards = unique.filter((c) => c.includes('card'))
  const badges = unique.filter((c) => c.includes('badge') || c.includes('pill'))
  const tables = unique.filter((c) => c.includes('table'))

  const shots = []

  for (const cls of buttons) {
    for (const state of ['default', 'hover', 'focus', 'active', 'disabled']) {
      shots.push({
        id: `component-${cls}-${state}`,
        group: 'buttons',
        className: cls,
        state,
        source: 'app/assets/css/main.css',
        tag: 'button',
        label: `${cls} (${state})`,
      })
    }
  }

  for (const cls of ['neo-input', 'tail-input', 'neo-textarea']) {
    for (const state of ['default', 'focus', 'error']) {
      shots.push({
        id: `component-${cls}-${state}`,
        group: 'inputs',
        className: cls,
        state,
        source: 'app/assets/css/main.css',
        tag: 'input',
        label: `${cls} (${state})`,
        error: state === 'error',
      })
    }
  }

  for (const cls of ['ios-card', 'tail-card', 'neo-card'].filter((c) => unique.includes(c) || c !== 'neo-card')) {
    if (!unique.includes(cls) && cls === 'neo-card') continue
    shots.push({
      id: `component-${cls}-default`,
      group: 'cards',
      className: cls,
      state: 'default',
      source: 'app/assets/css/main.css',
      tag: 'div',
      label: cls,
    })
  }

  for (const cls of badges.filter((c) => !c.includes('active') && !c.includes('inactive')).slice(0, 12)) {
    shots.push({
      id: `component-${cls}-default`,
      group: 'badges',
      className: cls,
      state: 'default',
      source: 'app/assets/css/main.css',
      tag: 'span',
      label: cls,
      text: 'نمونه',
    })
  }

  for (const cls of tables.slice(0, 4)) {
    shots.push({
      id: `component-${cls}-default`,
      group: 'tables',
      className: cls,
      state: 'default',
      source: 'app/assets/css/main.css',
      tag: 'div',
      label: cls,
    })
  }

  return { vueComponents: discoverVueComponents(), shots }
}

export function writeHarnessHtml(stylesheetHrefs) {
  const { shots } = harnessShots()
  const links = stylesheetHrefs.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')
  const sections = {}
  for (const shot of shots) {
    sections[shot.group] ||= []
    sections[shot.group].push(shot)
  }

  let body = `<body dir="rtl" class="bg-brand-cream text-brand-navy p-8 space-y-10">`
  body += `<h1 class="text-2xl font-bold mb-6">Inbox component harness (design-inventory-tool)</h1>`

  for (const [group, items] of Object.entries(sections)) {
    body += `<section class="space-y-4"><h2 class="text-lg font-semibold capitalize">${group}</h2><div class="grid gap-6">`
    for (const shot of items) {
      const disabled = shot.state === 'disabled' ? ' disabled' : ''
      const ariaInvalid = shot.error ? ' aria-invalid="true" class-error' : ''
      body += `<div data-shot-id="${shot.id}" data-state="${shot.state}" class="p-4 bg-white border border-brand-gray-200 rounded-tail space-y-2">`
      body += `<p class="text-xs text-brand-gray-500">${shot.label} · ${shot.source}</p>`
      if (shot.tag === 'button') {
        body += `<button type="button" class="${shot.className}"${disabled}>دکمه</button>`
      } else if (shot.tag === 'input') {
        const errCls = shot.error ? ' border-red-500 ring-2 ring-red-200' : ''
        body += `<input class="${shot.className}${errCls}" placeholder="متن نمونه" value="${shot.error ? '' : '09121234567'}" />`
      } else if (shot.tag === 'span') {
        body += `<span class="${shot.className}">${shot.text || 'badge'}</span>`
      } else {
        body += `<div class="${shot.className}"><p class="text-sm">کارت نمونه</p></div>`
      }
      body += `</div>`
    }
    body += `</div></section>`
  }
  body += `</body>`

  const html = `<!DOCTYPE html>
<html lang="fa">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${links}
<style>
  [data-state="hover"] button:not(:disabled) { pointer-events: auto; }
  .class-error { outline: 2px solid #c41e1e; }
  section { break-inside: avoid; }
</style>
</head>
${body}
</html>`

  const outPath = path.join(TOOL, 'harness', 'components.html')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, html)
  return { path: outPath, shots }
}
