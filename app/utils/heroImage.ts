/** Static `/hero/*` assets shipped as WebP + sized JPEG fallbacks (see `public/hero/`). */

const HERO_STEM_RE = /^\/hero\/([a-z0-9-]+?)(?:-\d+)?\.(?:jpe?g|webp)$/i

export function heroStem(src: string): string | null {
  const match = src.match(HERO_STEM_RE)
  return match?.[1] ?? null
}

export function isOptimizedHeroSrc(src: string): boolean {
  return Boolean(heroStem(src))
}

export function heroWebpSrcset(stem: string): string {
  return `/hero/${stem}.webp 750w, /hero/${stem}-1125.webp 1125w`
}

export function heroJpegSrcset(stem: string): string {
  return `/hero/${stem}-750.jpg 750w, /hero/${stem}-1125.jpg 1125w`
}

export function heroJpegFallback(stem: string): string {
  return `/hero/${stem}-750.jpg`
}

/** Default sizes for full-bleed phone-shell heroes (~375–430 CSS px). */
export const HERO_PHONE_SIZES = '(max-width: 430px) 100vw, 430px'
