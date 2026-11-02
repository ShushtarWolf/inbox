#!/usr/bin/env node
/** Build a relative-path static site for public hosting (not base64). */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TOOL = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(TOOL, '..')
const MANIFEST = JSON.parse(fs.readFileSync(path.join(TOOL, 'results/manifest.json'), 'utf8'))
const OUT = path.join(ROOT, 'design-inventory-site')

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function groupBy(arr, key) {
  const m = new Map()
  for (const item of arr) {
    const k = item[key] || 'other'
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(item)
  }
  return m
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'desktop'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'mobile'), { recursive: true })

// Copy only PNGs referenced in the manifest (keeps site lean)
const needed = new Set()
for (const p of [...MANIFEST.pages, ...MANIFEST.components]) {
  if (p.file) needed.add(p.file)
}
for (const rel of needed) {
  const src = path.join(ROOT, rel)
  if (!fs.existsSync(src)) continue
  const dest = path.join(OUT, path.basename(path.dirname(rel)), path.basename(rel))
  fs.copyFileSync(src, dest)
}

function imgSrc(entry) {
  if (!entry?.file) return ''
  const base = path.basename(entry.file)
  const folder = entry.viewport === 'mobile' ? 'mobile' : 'desktop'
  return `${folder}/${base}`
}

const pagesDesktop = MANIFEST.pages.filter((p) => p.viewport === 'desktop')
const pagesMobile = MANIFEST.pages.filter((p) => p.viewport === 'mobile')
const compDesktop = MANIFEST.components.filter((p) => p.viewport === 'desktop')
const compMobile = MANIFEST.components.filter((p) => p.viewport === 'mobile')
const pageIds = [...new Set(MANIFEST.pages.map((p) => p.id))].sort()
const compGroups = groupBy(compDesktop, 'group')
const tokens = MANIFEST.tokens

let tokenRows = ''
for (const v of tokens.cssVariables || []) {
  tokenRows += `<tr><td><code>${esc(v.name)}</code></td><td><span class="swatch" style="background:${esc(v.value)}"></span>${esc(v.value)}</td></tr>`
}
for (const c of tokens.palette || []) {
  tokenRows += `<tr><td>palette.${esc(c.name)}</td><td><span class="swatch" style="background:${esc(c.hex)}"></span>${esc(c.hex)}</td></tr>`
}

let pageSections = ''
for (const id of pageIds) {
  const d = pagesDesktop.find((p) => p.id === id)
  const m = pagesMobile.find((p) => p.id === id)
  const meta = d || m
  const dSrc = imgSrc(d)
  const mSrc = imgSrc(m)
  pageSections += `<article class="card" id="${esc(id)}">
<header><h3>${esc(id)}</h3><p class="meta">${esc(meta?.path || '')} · ${esc(meta?.source || '')}</p></header>
<div class="shots">
<figure data-v="desktop"><figcaption>Desktop 1440×900</figcaption>${dSrc ? `<img src="${esc(dSrc)}" alt="" loading="lazy"/>` : '<p class="meta">—</p>'}</figure>
<figure data-v="mobile"><figcaption>Mobile 390×844 @2x</figcaption>${mSrc ? `<img src="${esc(mSrc)}" alt="" loading="lazy"/>` : '<p class="meta">—</p>'}</figure>
</div></article>`
}

let compSections = ''
for (const [group, items] of [...compGroups.entries()].sort()) {
  compSections += `<section class="comp-group" id="comp-${esc(group)}"><h3>${esc(group)}</h3><div class="comp-grid">`
  for (const cid of [...new Set(items.map((i) => i.id))].sort()) {
    const d = compDesktop.find((c) => c.id === cid)
    const m = compMobile.find((c) => c.id === cid)
    const dSrc = imgSrc(d)
    const mSrc = imgSrc(m)
    compSections += `<article class="card comp" id="${esc(cid)}">
<header><h4>${esc(d?.name || cid)}</h4><p class="meta">${esc(d?.source || m?.source || '')}</p></header>
<div class="shots compact">
<figure data-v="desktop">${dSrc ? `<img src="${esc(dSrc)}" alt="" loading="lazy"/>` : ''}</figure>
<figure data-v="mobile">${mSrc ? `<img src="${esc(mSrc)}" alt="" loading="lazy"/>` : ''}</figure>
</div></article>`
  }
  compSections += `</div></section>`
}

const tocPages = pageIds.map((id) => `<a href="#${esc(id)}">${esc(id)}</a>`).join('')
const tocComp = [...compGroups.keys()].sort().map((g) => `<a href="#comp-${esc(g)}">${esc(g)}</a>`).join('')

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Inbox design inventory</title>
<style>
:root { --sidebar: 280px; --bg: #f4efe9; --ink: #2c2c2a; --accent: #c41e1e; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--ink); }
.layout { display: grid; grid-template-columns: var(--sidebar) 1fr; min-height: 100vh; }
aside { position: sticky; top: 0; height: 100vh; overflow: auto; padding: 1rem; background: #fff; border-inline-end: 1px solid #ddd; }
main { padding: 1rem 1.5rem 3rem; max-width: 1400px; }
.toolbar { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.toolbar button { padding: .4rem .75rem; border: 1px solid #ccc; background: #fff; cursor: pointer; border-radius: 4px; }
.toolbar button.active { border-color: var(--accent); color: var(--accent); font-weight: 600; }
nav.toc a { display: block; font-size: 12px; padding: 2px 0; color: #444; text-decoration: none; }
nav.toc h4 { margin: 1rem 0 .25rem; font-size: 13px; }
.card { background: #fff; border: 1px solid #e5e2dc; padding: 1rem; margin-bottom: 1rem; border-radius: 8px; }
.meta { font-size: 12px; color: #666; margin: .25rem 0 0; }
.shots { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.shots.compact img { max-height: 120px; object-fit: contain; }
figure { margin: 0; }
figure img { width: 100%; height: auto; border: 1px solid #eee; background: #fafafa; }
figcaption { font-size: 11px; color: #666; margin-bottom: .25rem; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
td, th { border: 1px solid #eee; padding: 6px 8px; text-align: start; }
.swatch { display: inline-block; width: 14px; height: 14px; border: 1px solid #ccc; margin-inline-end: 6px; vertical-align: middle; }
body[data-view="desktop"] figure[data-v="mobile"], body[data-view="mobile"] figure[data-v="desktop"] { display: none; }
body[data-view="desktop"] .shots, body[data-view="mobile"] .shots { grid-template-columns: 1fr; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } aside { position: static; height: auto; } .shots { grid-template-columns: 1fr; } }
.comp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: .75rem; }
h2 { margin-top: 2rem; border-bottom: 2px solid var(--accent); padding-bottom: .25rem; }
</style>
</head>
<body data-view="side">
<div class="layout">
<aside>
<h1>Inbox inventory</h1>
<p style="font-size:12px;color:#666">Captured ${esc(MANIFEST.capturedAt)} · shareable static site</p>
<div class="toolbar">
<button type="button" data-view="desktop">Desktop</button>
<button type="button" data-view="mobile">Mobile</button>
<button type="button" data-view="side" class="active">Side-by-side</button>
</div>
<nav class="toc">
<h4>Design tokens</h4><a href="#tokens">Tokens</a>
<h4>Pages (${pageIds.length})</h4>${tocPages}
<h4>Components</h4>${tocComp}
</nav>
</aside>
<main>
<section id="tokens"><h2>Design tokens</h2>
<p>Sources: ${(tokens.sources || []).map(esc).join(', ')}</p>
<ul>${(tokens.breakpoints || []).map((b) => `<li>${esc(b.name)}: ${b.px}px</li>`).join('')}</ul>
<p>${(tokens.fontFamilies || []).map(esc).join(' · ')}</p>
<table><thead><tr><th>Token</th><th>Value</th></tr></thead><tbody>${tokenRows}</tbody></table>
</section>
<section id="pages"><h2>Pages</h2>${pageSections}</section>
<section id="components"><h2>Components</h2>${compSections}</section>
</main>
</div>
<script>
document.querySelectorAll('.toolbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.body.dataset.view = btn.dataset.view;
    document.querySelectorAll('.toolbar button').forEach(b => b.classList.toggle('active', b === btn));
  });
});
</script>
</body>
</html>`

fs.writeFileSync(path.join(OUT, 'index.html'), html)
console.log('Wrote', OUT, 'desktop=', fs.readdirSync(path.join(OUT, 'desktop')).length, 'mobile=', fs.readdirSync(path.join(OUT, 'mobile')).length)
