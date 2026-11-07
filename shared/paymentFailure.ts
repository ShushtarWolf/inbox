/** Marker on createError data so the callback can tell a real decline from a retry. */

export type PaymentFailureData = {
  paymentFailure: true
  definitive: boolean
  code: string
}

export function paymentFailureData(definitive: boolean, code: string): PaymentFailureData {
  return { paymentFailure: true, definitive, code }
}

export function readPaymentFailure(err: unknown): PaymentFailureData | null {
  if (!err || typeof err !== 'object') return null
  const data = (err as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const row = data as Partial<PaymentFailureData>
  if (row.paymentFailure !== true || typeof row.code !== 'string') return null
  return {
    paymentFailure: true,
    definitive: row.definitive === true,
    code: row.code,
  }
}

/** Unknown throws are retryable. Only an explicit definitive flag may fail the row. */
export function isDefinitivePaymentFailure(err: unknown): boolean {
  return readPaymentFailure(err)?.definitive === true
}
