#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const APP_DIR = path.join(ROOT, 'app')
// FA-only launch: nuxt i18n loads only fa.json. Keep en.json for future re-enable,
// but do not require key parity in CI.
const LOCALES = ['fa']

function walk(dir, ext = '.vue') {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, ext))
    else if (entry.name.endsWith(ext)) out.push(full)
  }
  return out
}

function extractKeys(content) {
  const keys = new Set()
  const patterns = [
    /\b(?:t|\$t)\(\s*['"`]([^'"`]+)['"`]/g,
    /\b(?:t|\$t)\(\s*`([^`$]+)`/g,
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(content))) {
      const key = m[1].trim()
      if (key && !key.includes('${')) keys.add(key)
    }
  }
  return keys
}

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const text = raw.replace(/^\uFEFF/, '')
  const duplicateKeys = findDuplicateKeys(text)
  return { data: JSON.parse(text), duplicateKeys, filePath }
}

function findDuplicateKeys(jsonText) {
  const duplicates = []
  const stack = [{ keys: new Set() }]
  const lines = jsonText.split('\n')
  const keyRe = /^(\s*)"([^"\\]+)"\s*:/

  for (const line of lines) {
    const closes = (line.match(/}/g) || []).length
    for (let i = 0; i < closes && stack.length > 1; i++) stack.pop()

    const m = line.match(keyRe)
    if (m) {
      const key = m[2]
      const frame = stack[stack.length - 1]
      if (frame.keys.has(key)) duplicates.push(key)
      else frame.keys.add(key)
    }

    if (line.includes('{')) stack.push({ keys: new Set() })
  }

  return [...new Set(duplicates)]
}

function hasKey(obj, dotted) {
  return dotted.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj) !== undefined
}

function parentKey(dotted) {
  const parts = dotted.split('.')
  parts.pop()
  return parts.join('.')
}

function isDynamicFamily(key) {
  return key.includes('${')
}

const vueFiles = walk(APP_DIR)
const usedKeys = new Set()
for (const file of vueFiles) {
  for (const key of extractKeys(fs.readFileSync(file, 'utf8'))) usedKeys.add(key)
}

const localeData = Object.fromEntries(
  LOCALES.map((locale) => {
    const loaded = loadJson(path.join(ROOT, 'locales', `${locale}.json`))
    return [locale, loaded]
  }),
)

let failed = false

for (const [locale, { duplicateKeys, filePath }] of Object.entries(localeData)) {
  if (duplicateKeys.length) {
    failed = true
    console.error(`[i18n] Duplicate keys in ${path.relative(ROOT, filePath)}: ${duplicateKeys.join(', ')}`)
  }
}

for (const key of [...usedKeys].sort()) {
  if (isDynamicFamily(key)) continue
  for (const locale of LOCALES) {
    const { data, filePath } = localeData[locale]
    if (!hasKey(data, key)) {
      const parent = parentKey(key)
      if (parent && hasKey(data, parent) && typeof parentKey(key) === 'string') {
        // allow dynamic suffix families when parent object exists
        const parentVal = parent.split('.').reduce((acc, part) => acc?.[part], data)
        if (parentVal && typeof parentVal === 'object') continue
      }
      failed = true
      console.error(`[i18n] Missing ${locale} key: ${key} (used in app/)`)
    }
  }
}

if (failed) {
  console.error('\n[i18n] Check failed.')
  process.exit(1)
}

console.log(`[i18n] OK — ${usedKeys.size} keys checked across ${vueFiles.length} Vue files.`)
