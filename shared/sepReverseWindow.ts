/**
 * Digipay-like IPG reverse window: attempt SEP ReverseTransaction within N minutes
 * of gateway confirm; otherwise closed-loop wallet credit.
 */

export const SEP_REVERSE_WINDOW_MS = 25 * 60 * 1000

export function readPaymentConfirmedAt(meta: Record<string, unknown>): Date | null {
  const raw = meta.confirmedAt
  if (typeof raw !== 'string' || !raw.trim()) return null
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d : null
}

export function canAttemptSepReverse(opts: {
  method: string | null | undefined
  provider: string | null | undefined
  paymentsMode: string | null | undefined
  metadata: Record<string, unknown>
  now?: Date
}): { ok: true; refNum: string } | { ok: false; reason: string } {
  if (opts.method !== 'IPG') return { ok: false, reason: 'not_ipg' }
  if (opts.provider !== 'sep') return { ok: false, reason: 'not_sep' }
  if (opts.paymentsMode !== 'live') return { ok: false, reason: 'not_live' }
  if (opts.metadata.simulated) return { ok: false, reason: 'simulated' }
  if (opts.metadata.gatewayReversed === true) return { ok: false, reason: 'already_reversed' }
  const refNum = opts.metadata.refNum != null ? String(opts.metadata.refNum) : ''
  if (!refNum) return { ok: false, reason: 'missing_ref' }
  const confirmedAt = readPaymentConfirmedAt(opts.metadata)
  if (!confirmedAt) return { ok: false, reason: 'missing_confirmed_at' }
  const now = opts.now || new Date()
  if (now.getTime() - confirmedAt.getTime() > SEP_REVERSE_WINDOW_MS) {
    return { ok: false, reason: 'outside_window' }
  }
  return { ok: true, refNum }
}

/**
 * Timeout / network / unknown → ambiguous (may have succeeded at SEP).
 * Explicit SEP ResultCode business errors → definitive (safe to wallet-fallback).
 */
export function isSepReverseAmbiguousError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase()
  if (!msg) return true
  if (
    msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('aborted')
    || msg.includes('econnreset')
    || msg.includes('econnrefused')
    || msg.includes('fetch failed')
    || msg.includes('network')
    || msg.includes('socket')
  ) {
    return true
  }
  // sepClient throws `SEP reverse failed (code=N): …` for HTTP-OK business failures.
  if (msg.includes('sep reverse failed')) return false
  return true
}

/** Already-reversed / duplicate reverse responses — treat as gateway success. */
export function isSepReverseAlreadyDoneError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase()
  return msg.includes('already') || msg.includes('قبلا') || msg.includes('duplicate')
}
