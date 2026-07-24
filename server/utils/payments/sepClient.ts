/**
 * SEP (Saman Electronic Payment / سامان کیش) JSON IPG client.
 * Token → redirect → callback → VerifyTransaction / ReverseTransaction.
 *
 * Docs (merchant): https://www.sep.ir/
 * Hosts: https://sep.shaparak.ir
 */

export interface SepTokenInput {
  terminalId: string
  amount: number
  resNum: string
  redirectUrl: string
  cellNumber?: string
}

export interface SepTokenResult {
  status: number
  token: string
  errorCode?: string
  errorDesc?: string
}

export interface SepVerifyInput {
  terminalId: string
  refNum: string
}

export interface SepVerifyResult {
  resultCode: number
  resultDescription?: string
  success: boolean
  amount?: number
  resNum?: string
  maskedPan?: string
  traceNo?: string
}

export interface SepReverseInput {
  terminalId: string
  refNum: string
}

export interface SepReverseResult {
  resultCode: number
  resultDescription?: string
  success: boolean
}

type FetchLike = typeof fetch

const DEFAULT_BASE = 'https://sep.shaparak.ir'

export function sepBaseUrl(): string {
  const raw = process.env.SEP_BASE_URL?.trim()
  return (raw || DEFAULT_BASE).replace(/\/$/, '')
}

/** GET redirect into the bank UI (token already issued). */
export function sepStartPayUrl(token: string): string {
  return `${sepBaseUrl()}/OnlinePG/SendToken?token=${encodeURIComponent(token)}`
}

/** ResultCode 0 = first verify, 2 = already verified (idempotent). */
export function isSepVerifySuccess(resultCode: number): boolean {
  return resultCode === 0 || resultCode === 2
}

export function isSepTokenSuccess(status: number, token: string): boolean {
  return status === 1 && Boolean(token)
}

/** Simulated refs for local test-gateway — never call SEP. */
export function isSepSimulatedRef(ref: string): boolean {
  return ref.startsWith('SIM') || ref.startsWith('sep-test-')
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  fetchImpl?: FetchLike,
): Promise<T> {
  const fetchFn = fetchImpl || fetch
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({})) as T
  if (!res.ok) {
    const message = typeof json === 'object' && json && 'errorDesc' in json
      ? String((json as { errorDesc?: unknown }).errorDesc || res.statusText)
      : res.statusText
    throw new Error(`SEP HTTP ${res.status}: ${message}`)
  }
  return json
}

function terminalNumber(terminalId: string): number {
  const n = Number(terminalId)
  if (!Number.isFinite(n)) {
    throw new Error('SEP terminal id must be numeric')
  }
  return n
}

export async function sepRequestToken(
  input: SepTokenInput,
  fetchImpl?: FetchLike,
): Promise<SepTokenResult> {
  const envelope = await postJson<Record<string, unknown>>(
    `${sepBaseUrl()}/onlinepg/onlinepg`,
    {
      action: 'token',
      TerminalId: input.terminalId,
      Amount: input.amount,
      ResNum: input.resNum,
      RedirectUrl: input.redirectUrl,
      ...(input.cellNumber ? { CellNumber: input.cellNumber } : {}),
    },
    fetchImpl,
  )
  const status = Number(envelope.status ?? envelope.Status ?? 0)
  const token = String(envelope.token || envelope.Token || '')
  const errorCode = envelope.errorCode != null ? String(envelope.errorCode) : undefined
  const errorDesc = envelope.errorDesc != null
    ? String(envelope.errorDesc)
    : envelope.ErrorDesc != null
      ? String(envelope.ErrorDesc)
      : undefined

  if (!isSepTokenSuccess(status, token)) {
    throw new Error(`SEP token failed (status=${status}): ${errorDesc || errorCode || 'request failed'}`)
  }
  return { status, token, errorCode, errorDesc }
}

export async function sepVerifyTransaction(
  input: SepVerifyInput,
  fetchImpl?: FetchLike,
): Promise<SepVerifyResult> {
  const envelope = await postJson<Record<string, unknown>>(
    `${sepBaseUrl()}/verifyTxnRandomSessionkey/ipg/VerifyTransaction`,
    {
      RefNum: input.refNum,
      TerminalNumber: terminalNumber(input.terminalId),
    },
    fetchImpl,
  )
  const resultCode = Number(envelope.ResultCode ?? envelope.resultCode ?? -1)
  const detail = (envelope.TransactionDetail || envelope.transactionDetail || {}) as Record<string, unknown>
  return {
    resultCode,
    resultDescription: envelope.ResultDescription != null
      ? String(envelope.ResultDescription)
      : envelope.resultDescription != null
        ? String(envelope.resultDescription)
        : undefined,
    success: Boolean(envelope.Success ?? envelope.success ?? isSepVerifySuccess(resultCode)),
    amount: detail.Amount != null
      ? Number(detail.Amount)
      : detail.OrginalAmount != null
        ? Number(detail.OrginalAmount)
        : undefined,
    resNum: detail.ResNum != null ? String(detail.ResNum) : undefined,
    maskedPan: detail.MaskedPan != null ? String(detail.MaskedPan) : undefined,
    traceNo: detail.StraceNo != null
      ? String(detail.StraceNo)
      : detail.TraceNo != null
        ? String(detail.TraceNo)
        : undefined,
  }
}

export async function sepReverseTransaction(
  input: SepReverseInput,
  fetchImpl?: FetchLike,
): Promise<SepReverseResult> {
  const envelope = await postJson<Record<string, unknown>>(
    `${sepBaseUrl()}/verifyTxnRandomSessionkey/ipg/ReverseTransaction`,
    {
      RefNum: input.refNum,
      TerminalNumber: terminalNumber(input.terminalId),
    },
    fetchImpl,
  )
  const resultCode = Number(envelope.ResultCode ?? envelope.resultCode ?? -1)
  const success = Boolean(envelope.Success ?? envelope.success ?? resultCode === 0)
  if (!success) {
    const desc = envelope.ResultDescription != null
      ? String(envelope.ResultDescription)
      : 'reverse failed'
    throw new Error(`SEP reverse failed (code=${resultCode}): ${desc}`)
  }
  return {
    resultCode,
    resultDescription: envelope.ResultDescription != null
      ? String(envelope.ResultDescription)
      : undefined,
    success: true,
  }
}
