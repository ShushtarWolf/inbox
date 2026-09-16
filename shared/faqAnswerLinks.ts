/**
 * Split FAQ answer prose so absolute site URLs become labeled in-app links.
 * JSON-LD / crawlers still receive the original full-URL answer text.
 */

export type FaqAnswerPart =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; path: string; label: string }

const PATH_LABELS: Record<string, string> = {
  '/': 'صفحه اصلی',
  '/clubs': 'فهرست باشگاه‌ها',
  '/pricing': 'قیمت‌ها',
  '/cancellation': 'لغو و استرداد',
  '/about': 'درباره ما',
  '/clubs/apply': 'ثبت باشگاه',
  '/clubs/tehran/padel': 'زمین پدل تهران',
  '/clubs/tehran/tennis': 'زمین تنیس تهران',
}

const URL_RE = /https?:\/\/[^\s\u060C\u061B\u06D4،؛»]+/gi

function normalizeSiteBase(siteBase: string): string {
  return String(siteBase || '').replace(/\/$/, '') || 'https://inboxs.ir'
}

function stripTrailingUrlJunk(raw: string): { url: string; trailing: string } {
  let url = raw
  let trailing = ''
  while (url.length && /[.,;:!?)\]]$/.test(url)) {
    trailing = url.slice(-1) + trailing
    url = url.slice(0, -1)
  }
  return { url, trailing }
}

function pathFromAbsoluteUrl(absolute: string, siteBase: string): string | null {
  const base = normalizeSiteBase(siteBase)
  try {
    const parsed = new URL(absolute)
    const baseParsed = new URL(base)
    if (parsed.origin !== baseParsed.origin) return null
    const path = parsed.pathname.replace(/\/$/, '') || '/'
    return path
  }
  catch {
    return null
  }
}

export function labelForFaqPath(path: string): string {
  const normalized = path.replace(/\/$/, '') || '/'
  if (PATH_LABELS[normalized]) return PATH_LABELS[normalized]
  if (normalized.startsWith('/clubs/') && normalized.split('/').length === 3) {
    return 'صفحه باشگاه'
  }
  return 'این صفحه'
}

/**
 * Split answer text into text + in-app link parts for absolute URLs on this site.
 */
export function splitFaqAnswerLinks(answer: string, siteBase = 'https://inboxs.ir'): FaqAnswerPart[] {
  const text = String(answer || '')
  if (!text) return []

  const parts: FaqAnswerPart[] = []
  let lastIndex = 0
  const re = new RegExp(URL_RE.source, URL_RE.flags)
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) != null) {
    const raw = match[0]
    const start = match.index
    if (start > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, start) })
    }

    const { url, trailing } = stripTrailingUrlJunk(raw)
    const path = pathFromAbsoluteUrl(url, siteBase)
    if (path) {
      parts.push({
        type: 'link',
        href: url,
        path,
        label: labelForFaqPath(path),
      })
      if (trailing) parts.push({ type: 'text', value: trailing })
    }
    else {
      parts.push({ type: 'text', value: raw })
    }

    lastIndex = start + raw.length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return coalesceTextParts(parts.length ? parts : [{ type: 'text', value: text }])
}

function coalesceTextParts(parts: FaqAnswerPart[]): FaqAnswerPart[] {
  const out: FaqAnswerPart[] = []
  for (const part of parts) {
    const prev = out[out.length - 1]
    if (part.type === 'text' && prev?.type === 'text') {
      prev.value += part.value
    }
    else {
      out.push(part.type === 'text' ? { type: 'text', value: part.value } : part)
    }
  }
  return out
}
