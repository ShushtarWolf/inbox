/**
 * Zarinpal REST v4 client (request / verify / refund).
 * Docs: https://www.zarinpal.com/docs/paymentGateway/
 *
 * Chosen as the primary IR IPG because it is already the live default in
 * `resolvePaymentProvider`, has a sandbox host, and matches the existing
 * provider registry slot — IDPay remains typed but unimplemented.
 */

export type ZarinpalApiMode = 'sandbox' | 'live'

export interface ZarinpalRequestInput {
  merchantId: string
  amount: number
  callbackUrl: string
  description: string
  metadata?: { mobile?: string; email?: string }
}

export interface ZarinpalRequestResult {
  code: number
  authority: string
  message?: string
}

export interface ZarinpalVerifyInput {
  merchantId: string
  amount: number
  authority: string
}

export interface ZarinpalVerifyResult {
  code: number
  refId?: number
  cardPan?: string
  message?: string
}

export interface ZarinpalRefundInput {
  merchantId: string
  authority: string
  accessToken: string
}

export interface ZarinpalRefundResult {
  code: number
  message?: string
}

export function zarinpalApiBase(mode: ZarinpalApiMode): string {
  return mode === 'live'
    ? 'https://payment.zarinpal.com/pg/v4/payment'
    : 'https://sandbox.zarinpal.com/pg/v4/payment'
}

export function zarinpalStartPayUrl(authority: string, mode: ZarinpalApiMode): string {
  return mode === 'live'
    ? `https://www.zarinpal.com/pg/StartPay/${authority}`
    : `https://sandbox.zarinpal.com/pg/StartPay/${authority}`
}

export function zarinpalRefundApiBase(mode: ZarinpalApiMode): string {
  return mode === 'live'
    ? 'https://api.zarinpal.com/pg/v4/payment'
    : 'https://sandbox.zarinpal.com/pg/v4/payment'
}

/** Success codes: 100 = first verify, 101 = already verified (idempotent). */
export function isZarinpalVerifySuccess(code: number): boolean {
  return code === 100 || code === 101
}

export function isZarinpalRequestSuccess(code: number): boolean {
  return code === 100
}

type FetchLike = typeof fetch

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  options: { headers?: Record<string, string>; fetchImpl?: FetchLike } = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl || fetch
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({})) as T
  if (!res.ok) {
    const message = typeof json === 'object' && json && 'message' in json
      ? String((json as { message?: unknown }).message || res.statusText)
      : res.statusText
    throw new Error(`Zarinpal HTTP ${res.status}: ${message}`)
  }
  return json
}

type Envelope = {
  data?: Record<string, unknown> | []
  errors?: unknown
}

function readData(envelope: Envelope): Record<string, unknown> {
  if (!envelope.data || Array.isArray(envelope.data)) return {}
  return envelope.data
}

export async function zarinpalRequestPayment(
  mode: ZarinpalApiMode,
  input: ZarinpalRequestInput,
  fetchImpl?: FetchLike,
): Promise<ZarinpalRequestResult> {
  const envelope = await postJson<Envelope>(
    `${zarinpalApiBase(mode)}/request.json`,
    {
      merchant_id: input.merchantId,
      amount: input.amount,
      callback_url: input.callbackUrl,
      description: input.description,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
    { fetchImpl },
  )
  const data = readData(envelope)
  const code = Number(data.code ?? 0)
  const authority = String(data.authority || '')
  if (!isZarinpalRequestSuccess(code) || !authority) {
    const errMsg = typeof envelope.errors === 'object' && envelope.errors
      ? JSON.stringify(envelope.errors)
      : String(data.message || 'request failed')
    throw new Error(`Zarinpal request failed (code=${code}): ${errMsg}`)
  }
  return { code, authority, message: data.message ? String(data.message) : undefined }
}

export async function zarinpalVerifyPayment(
  mode: ZarinpalApiMode,
  input: ZarinpalVerifyInput,
  fetchImpl?: FetchLike,
): Promise<ZarinpalVerifyResult> {
  const envelope = await postJson<Envelope>(
    `${zarinpalApiBase(mode)}/verify.json`,
    {
      merchant_id: input.merchantId,
      amount: input.amount,
      authority: input.authority,
    },
    { fetchImpl },
  )
  const data = readData(envelope)
  return {
    code: Number(data.code ?? 0),
    refId: data.ref_id != null ? Number(data.ref_id) : undefined,
    cardPan: data.card_pan != null ? String(data.card_pan) : undefined,
    message: data.message != null ? String(data.message) : undefined,
  }
}

export async function zarinpalRefundPayment(
  mode: ZarinpalApiMode,
  input: ZarinpalRefundInput,
  fetchImpl?: FetchLike,
): Promise<ZarinpalRefundResult> {
  const envelope = await postJson<Envelope>(
    `${zarinpalRefundApiBase(mode)}/refund.json`,
    {
      merchant_id: input.merchantId,
      authority: input.authority,
    },
    {
      fetchImpl,
      headers: { Authorization: `Bearer ${input.accessToken}` },
    },
  )
  const data = readData(envelope)
  const code = Number(data.code ?? 0)
  if (code !== 100) {
    const errMsg = typeof envelope.errors === 'object' && envelope.errors
      ? JSON.stringify(envelope.errors)
      : String(data.message || 'refund failed')
    throw new Error(`Zarinpal refund failed (code=${code}): ${errMsg}`)
  }
  return { code, message: data.message ? String(data.message) : undefined }
}

/** Simulated authorities (local test gateway) — never call Zarinpal for these. */
export function isZarinpalSimulatedAuthority(authority: string): boolean {
  return authority.startsWith('SIM') || authority.startsWith('zarinpal-test-')
}
