/**
 * Leave the app for an IPG without awaiting navigation.
 *
 * SEP’s documented handoff is POST https://sep.shaparak.ir/OnlinePG/OnlinePG
 * with hidden Token=. We currently receive GET /OnlinePG/SendToken?token=…
 * from createIntent; that GET (and Nuxt navigateTo) can hang on TLS while
 * the caller’s `paying` flag stays true forever.
 */

export const GATEWAY_REDIRECT_STALL_MS = 8000
export const SEP_DEFAULT_ORIGIN = 'https://sep.shaparak.ir'

export type SepPostHandoff = {
  kind: 'sep-post'
  token: string
  actionUrl: string
}

export type AssignHandoff = {
  kind: 'assign'
  url: string
}

export type PaymentHandoff = SepPostHandoff | AssignHandoff

export type PaymentRedirectRuntime = {
  document?: Pick<Document, 'createElement' | 'body'>
  assign?: (href: string) => void
}

export function parseSepSendToken(url: string): string | null {
  try {
    const parsed = new URL(url, SEP_DEFAULT_ORIGIN)
    if (!/\/OnlinePG\/SendToken$/i.test(parsed.pathname)) return null
    const token = parsed.searchParams.get('token')?.trim()
    return token || null
  } catch {
    return null
  }
}

/** POST action for a token already issued by sepRequestToken. */
export function sepOnlinePgUrl(fromRedirectUrl?: string): string {
  try {
    if (fromRedirectUrl) {
      const parsed = new URL(fromRedirectUrl, SEP_DEFAULT_ORIGIN)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return `${parsed.origin}/OnlinePG/OnlinePG`
      }
    }
  }
  catch {
    // fall through
  }
  return `${SEP_DEFAULT_ORIGIN}/OnlinePG/OnlinePG`
}

export function paymentHandoffFromRedirectUrl(url: string): PaymentHandoff {
  const token = parseSepSendToken(url)
  if (token) {
    return {
      kind: 'sep-post',
      token,
      actionUrl: sepOnlinePgUrl(url),
    }
  }
  return { kind: 'assign', url: rewriteRedirectToCurrentOrigin(url) }
}

/** Rewrite absolute localhost/127.0.0.1 app URLs to the current browser origin. */
export function rewriteRedirectToCurrentOrigin(url: string, origin?: string): string {
  if (url.startsWith('/') && !url.startsWith('//')) return url

  const currentOrigin = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  if (!currentOrigin) return url

  try {
    const parsed = new URL(url)
    const current = new URL(currentOrigin)
    const isLocalDevHost = (host: string) => host === 'localhost' || host === '127.0.0.1'

    if (
      parsed.port === current.port
      && isLocalDevHost(parsed.hostname)
      && isLocalDevHost(current.hostname)
      && parsed.origin !== current.origin
      && parsed.pathname.startsWith('/')
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  }
  catch {
    // fall through
  }
  return url
}

export function createSepTokenForm(
  document: Pick<Document, 'createElement'>,
  token: string,
  actionUrl: string,
): HTMLFormElement {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = actionUrl
  form.acceptCharset = 'UTF-8'
  form.setAttribute('target', '_self')
  form.style.display = 'none'
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = 'Token'
  input.value = token
  form.appendChild(input)
  return form
}

function defaultAssign(href: string) {
  if (typeof window !== 'undefined') window.location.assign(href)
}

/**
 * Fire-and-forget: POST Token to OnlinePG, else location.assign.
 * Never returns a promise for the destination load — callers must time out.
 */
export function leaveToPaymentGateway(
  url: string,
  runtime?: PaymentRedirectRuntime,
): PaymentHandoff['kind'] {
  const handoff = paymentHandoffFromRedirectUrl(url)
  const assign = runtime?.assign ?? defaultAssign

  if (handoff.kind === 'sep-post') {
    try {
      const doc = runtime?.document
        ?? (typeof document !== 'undefined' ? document : undefined)
      if (doc?.body) {
        const form = createSepTokenForm(doc, handoff.token, handoff.actionUrl)
        doc.body.appendChild(form)
        form.submit()
        return 'sep-post'
      }
    }
    catch {
      // GET SendToken fallback if the form cannot be submitted.
    }
    assign(url)
    return 'assign'
  }

  assign(handoff.url)
  return 'assign'
}

/** Shape `useFetchError` already reads — Farsi statusMessage is shown as-is. */
export function gatewayStallError(message: string): Error & { data: { statusMessage: string } } {
  const err = new Error(message) as Error & { data: { statusMessage: string } }
  err.name = 'GatewayRedirectStalledError'
  err.data = { statusMessage: message }
  return err
}
