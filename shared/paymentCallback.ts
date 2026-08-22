/**
 * Normalize SEP / test-gateway query+body fields for payment callbacks.
 * SEP typically POSTs: ResNum, RefNum, State=OK|Canceled|…
 * Test gateway may send Authority/ResNum + Status/State.
 */
export function readPaymentCallbackFields(
  query: Record<string, unknown>,
  body?: Record<string, unknown>,
) {
  const src = { ...query, ...(body || {}) }

  function pickString(...vals: unknown[]): string | undefined {
    for (const v of vals) {
      if (v == null) continue
      const s = String(v).trim()
      if (s) return s
    }
    return undefined
  }

  return {
    providerRef: pickString(src.ResNum, src.resNum, src.Authority, src.authority, src.ref),
    refNum: pickString(src.RefNum, src.refNum),
    statusRaw: String(src.State || src.state || src.Status || src.status || '').toUpperCase(),
  }
}

/**
 * True when callback State/Status means successful bank return (still needs verify).
 * Empty/missing State is NOT success — callers (test-gateway, SEP) must send State=OK explicitly.
 */
export function isPaymentCallbackOk(statusRaw: string): boolean {
  return statusRaw === 'OK'
}
