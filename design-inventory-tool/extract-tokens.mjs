import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function extractDesignTokens() {
  const tokensCss = fs.readFileSync(path.join(ROOT, 'app/assets/css/tokens.css'), 'utf8')
  const mainCss = fs.readFileSync(path.join(ROOT, 'app/assets/css/main.css'), 'utf8')
  const tailwindTs = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8')
  const paletteTs = fs.readFileSync(path.join(ROOT, 'server/utils/palette.ts'), 'utf8')

  const cssVars = [...tokensCss.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => ({
    name: m[1],
    value: m[2].trim(),
  }))

  const fontFaces = [...mainCss.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1])
  const fontFamilies = [...new Set(fontFaces)]

  const fontSizes = [...mainCss.matchAll(/text-(xs|sm|base|lg|xl|2xl|3xl|4xl|\[[^\]]+\])/g)].map((m) => m[1])
  const fontWeights = [...mainCss.matchAll(/font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[[^\]]+\])/g)].map(
    (m) => m[1],
  )

  const spacing = [...mainCss.matchAll(/\b(p|px|py|pt|pb|pl|pr|m|mx|my|gap|space-[xy])-(\d+(?:\.\d+)?|\[[^\]]+\])/g)].map(
    (m) => `${m[1]}-${m[2]}`,
  )

  const radii = [...mainCss.matchAll(/rounded-([\w-]+|\[[^\]]+\])/g)].map((m) => m[1])
  const shadows = [...mainCss.matchAll(/shadow-([\w-]+|\[[^\]]+\])/g)].map((m) => m[1])

  const paletteColors = [...paletteTs.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{3,8})'/g)].map((m) => ({
    name: m[1],
    hex: m[2].toUpperCase(),
  }))

  const tailwindColors = [...tailwindTs.matchAll(/(\w[\w-]*):\s*palette\.[\w.]+/g)].map((m) => m[1])

  const breakpoints = [
    { name: 'sm', px: 640 },
    { name: 'md', px: 768 },
    { name: 'lg', px: 1024 },
    { name: 'xl', px: 1280 },
    { name: '2xl', px: 1536 },
  ]

  const borderRadiusTheme = [...tailwindTs.matchAll(/(\w[\w-]*):\s*'([^']+)'/g)]
    .filter((m) => tailwindTs.includes('borderRadius'))
    .slice(0, 20)

  return {
    extractedAt: new Date().toISOString(),
    cssVariables: cssVars,
    palette: paletteColors,
    tailwindBrandKeys: [...new Set(tailwindColors)],
    fontFamilies: fontFamilies.sort(),
    fontSizes: [...new Set(fontSizes)].sort(),
    fontWeights: [...new Set(fontWeights)].sort(),
    spacing: [...new Set(spacing)].sort().slice(0, 80),
    borderRadius: [...new Set(radii)].sort().slice(0, 40),
    boxShadows: [...new Set(shadows)].sort(),
    breakpoints,
    tailwindBorderRadius: Object.fromEntries(borderRadiusTheme.map((m) => [m[1], m[2]])),
    sources: [
      'app/assets/css/tokens.css',
      'app/assets/css/main.css',
      'tailwind.config.ts',
      'server/utils/palette.ts',
    ],
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tokens = extractDesignTokens()
  console.log(JSON.stringify(tokens, null, 2))
}
