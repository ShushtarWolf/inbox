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
