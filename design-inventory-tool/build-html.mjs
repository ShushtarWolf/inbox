import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWriteStream } from 'node:fs'

async function loadSharp() {
  try {
    return (await import('sharp')).default
  } catch {
    return null
  }
}

const TOOL = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(TOOL, '..')
const MANIFEST_PATH = path.join(TOOL, 'results', 'manifest.json')
const HTML_OUT = path.join(ROOT, 'design-inventory.html')
const HTML_LITE = path.join(ROOT, 'design-inventory-lite.html')
const MAX_MB = 50

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
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

async function embedDataUrl(absPath, { useJpeg, sharp }) {
  if (!fs.existsSync(absPath)) return ''
  if (useJpeg && sharp) {
    const buf = await sharp(absPath).jpeg({ quality: 74, mozjpeg: true }).toBuffer()
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  }
  const buf = fs.readFileSync(absPath)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function writeHead(out, manifest, pageIds, tocPages, tocComp, tokens) {
  let tokenRows = ''
  for (const v of tokens.cssVariables || []) {
    tokenRows += `<tr><td><code>${esc(v.name)}</code></td><td><span class="swatch" style="background:${esc(v.value)}"></span>${esc(v.value)}</td></tr>`
  }
  for (const c of tokens.palette || []) {
    tokenRows += `<tr><td>palette.${esc(c.name)}</td><td><span class="swatch" style="background:${esc(c.hex)}"></span>${esc(c.hex)}</td></tr>`
  }
  out.write(`<!DOCTYPE html>
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
.toolbar { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1rem; position: sticky; top: 0; background: var(--bg); padding: .5rem 0; z-index: 2; }
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
td, th { border: 1px solid #eee; padding: 6px 8px; text-align: start; vertical-align: middle; }
.swatch { display: inline-block; width: 14px; height: 14px; border: 1px solid #ccc; vertical-align: middle; margin-inline-end: 6px; }
body[data-view="desktop"] figure[data-v="mobile"], body[data-view="mobile"] figure[data-v="desktop"] { display: none; }
body[data-view="desktop"] .shots, body[data-view="mobile"] .shots { grid-template-columns: 1fr; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } aside { position: static; height: auto; } .shots { grid-template-columns: 1fr; } }
.comp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: .75rem; }
h1 { font-size: 1.5rem; }
h2 { margin-top: 2rem; border-bottom: 2px solid var(--accent); padding-bottom: .25rem; }
</style>
</head>
<body data-view="side">
<div class="layout">
<aside>
<h1>Inbox inventory</h1>
<p style="font-size:12px;color:#666">Captured ${esc(manifest.capturedAt)}<br/>Base: ${esc(manifest.baseUrl)}</p>
<div class="toolbar" id="toc-toolbar">
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
<h3>Breakpoints (Tailwind defaults)</h3>
<ul>${(tokens.breakpoints || []).map((b) => `<li>${esc(b.name)}: ${b.px}px</li>`).join('')}</ul>
<h3>Font families</h3><p>${(tokens.fontFamilies || []).map(esc).join(' · ')}</p>
<h3>CSS variables & palette</h3>
<table><thead><tr><th>Token</th><th>Value</th></tr></thead><tbody>${tokenRows}</tbody></table>
</section>
<section id="pages"><h2>Pages</h2>`)
}

function writeFoot(out, manifest) {
  out.write(`</section>
<section id="components"><h2>Components</h2>`)
}

async function streamBuild(outPath, manifest, opts) {
  const sharp = opts.useJpeg ? await loadSharp() : null
  const pagesDesktop = manifest.pages.filter((p) => p.viewport === 'desktop')
  const pagesMobile = manifest.pages.filter((p) => p.viewport === 'mobile')
  const compDesktop = manifest.components.filter((p) => p.viewport === 'desktop')
  const compMobile = manifest.components.filter((p) => p.viewport === 'mobile')
  const pageIds = [...new Set(manifest.pages.map((p) => p.id))].sort()
  const compGroups = groupBy(compDesktop, 'group')
  const tocPages = pageIds.map((id) => `<a href="#${esc(id)}">${esc(id)}</a>`).join('')
  const tocComp = [...compGroups.keys()].sort().map((g) => `<a href="#comp-${esc(g)}">${esc(g)}</a>`).join('')
  const tokens = manifest.tokens

  await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
  const out = createWriteStream(outPath)
  writeHead(out, manifest, pageIds, tocPages, tocComp, tokens)

  for (const id of pageIds) {
    const d = pagesDesktop.find((p) => p.id === id)
    const m = pagesMobile.find((p) => p.id === id)
    const meta = d || m
    const dSrc = d ? await embedDataUrl(path.join(ROOT, d.file), { useJpeg: opts.useJpeg, sharp }) : ''
    const mSrc = m ? await embedDataUrl(path.join(ROOT, m.file), { useJpeg: opts.useJpeg, sharp }) : ''
    out.write(`<article class="card" id="${esc(id)}" data-view="all">
<header><h3>${esc(id)}</h3><p class="meta">${esc(meta?.path || '')} · ${esc(meta?.source || '')}</p></header>
<div class="shots">
<figure data-v="desktop"><figcaption>Desktop 1440×900</figcaption><img data-role="desktop" src="${dSrc}" alt="${esc(id)} desktop" loading="lazy"/></figure>
<figure data-v="mobile"><figcaption>Mobile 390×844 @2x</figcaption><img data-role="mobile" src="${mSrc}" alt="${esc(id)} mobile" loading="lazy"/></figure>
</div></article>`)
  }

  writeFoot(out, manifest)

  for (const [group, items] of [...compGroups.entries()].sort()) {
    out.write(`<section class="comp-group" id="comp-${esc(group)}"><h3>${esc(group)}</h3><div class="comp-grid">`)
    const ids = [...new Set(items.map((i) => i.id))].sort()
    for (const cid of ids) {
      const d = compDesktop.find((c) => c.id === cid)
      const m = compMobile.find((c) => c.id === cid)
      const dSrc = d ? await embedDataUrl(path.join(ROOT, d.file), { useJpeg: opts.useJpeg, sharp }) : ''
      const mSrc = m ? await embedDataUrl(path.join(ROOT, m.file), { useJpeg: opts.useJpeg, sharp }) : ''
      out.write(`<article class="card comp" id="${esc(cid)}" data-view="all">
<header><h4>${esc(d?.name || cid)}</h4><p class="meta">${esc(d?.source || m?.source || '')}</p></header>
<div class="shots compact">
<figure data-v="desktop"><img data-role="desktop" src="${dSrc}" alt=""/></figure>
<figure data-v="mobile"><img data-role="mobile" src="${mSrc}" alt=""/></figure>
</div></article>`)
    }
    out.write(`</div></section>`)
  }

  out.write(`</section>
<section id="catalog"><h2>Vue component files (${manifest.vueComponents?.length || 0})</h2>
<ul>${(manifest.vueComponents || []).map((c) => `<li><strong>${esc(c.name)}</strong> — <code>${esc(c.source)}</code></li>`).join('')}</ul>
</section>
</main></div>
<script>
document.querySelectorAll('.toolbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.body.dataset.view = btn.dataset.view;
    document.querySelectorAll('.toolbar button').forEach(b => b.classList.toggle('active', b === btn));
  });
});
</script>
</body></html>`)

  await new Promise((resolve, reject) => {
    out.on('finish', resolve)
    out.on('error', reject)
    out.end()
  })
}

export async function buildHtml() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  await streamBuild(HTML_OUT, manifest, { useJpeg: false })

  const sizeMb = fs.statSync(HTML_OUT).size / (1024 * 1024)
  let litePath = null
  if (sizeMb > MAX_MB) {
    await streamBuild(HTML_LITE, manifest, { useJpeg: true })
    litePath = HTML_LITE
  }

  const pagesDesktop = manifest.pages.filter((p) => p.viewport === 'desktop')
  const pagesMobile = manifest.pages.filter((p) => p.viewport === 'mobile')
  const compDesktop = manifest.components.filter((p) => p.viewport === 'desktop')
  const compMobile = manifest.components.filter((p) => p.viewport === 'mobile')

  return {
    htmlPath: HTML_OUT,
    sizeMb,
    litePath,
    liteSizeMb: litePath ? fs.statSync(litePath).size / (1024 * 1024) : null,
    counts: {
      pagesDesktop: pagesDesktop.length,
      pagesMobile: pagesMobile.length,
      compDesktop: compDesktop.length,
      compMobile: compMobile.length,
      uniquePages: new Set(manifest.pages.map((p) => p.id)).size,
      uniqueComponents: new Set(manifest.components.map((c) => c.id)).size,
    },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildHtml()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
