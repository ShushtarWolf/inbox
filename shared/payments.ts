/**
 * ISO code for Iranian rial (what Shaparak/SEP uses).
 * Integers in this product — Payment.amount, wallet, court prices, UI — are **toman**.
 * Convert with `tomanToRials` only when talking to an IPG.
 */
export const PAYMENT_CURRENCY = 'IRR' as const

/** Everyday unit: 1 toman = 10 rials. */
export const TOMAN_TO_RIALS = 10

/** SEP `Amount` is rials. App money stays toman. */
export function tomanToRials(toman: number): number {
  return Math.round(toman) * TOMAN_TO_RIALS
}

/** Bank rials → product toman. Used when adopting a SEP charge into Payment.amount. */
export function rialsToToman(rials: number): number {
  return Math.round(rials / TOMAN_TO_RIALS)
}

export type PaymentProvider = 'pay_at_club' | 'sep' | 'idpay' | 'log'

export interface PaymentConfirmOptions {
  /** SEP bank RefNum from callback (required for live verify). */
  refNum?: string
}

export type PaymentIntentStatus =
  | 'PAY_AT_CLUB'
  | 'PENDING_AT_CLUB'
  | 'PENDING_ONLINE'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'

export type PaymentsMode = 'pay_at_club' | 'test' | 'live'

export interface PaymentIntent {
  id: string
  amount: number
  currency: typeof PAYMENT_CURRENCY
  status: PaymentIntentStatus
  provider: PaymentProvider
  providerRef?: string
  redirectUrl?: string
}

export interface CheckoutSession {
  paymentId: string
  intent: PaymentIntent
  mode: PaymentsMode
}

export interface PaymentCreateInput {
  amount: number
  bookingId?: string
  coachSessionId?: string
  packageBookingId?: string
  /** Competition entry being paid (stored in metadata; linked via CompetitionEntry.paymentId). */
  competitionEntryId?: string
  /** Athlete who owns a wallet top-up (no booking parent). */
  userId?: string
  /** booking (default) | topup | competition */
  purpose?: 'booking' | 'topup' | 'competition'
  idempotencyKey: string
  /** Refresh an existing PENDING_ONLINE row instead of creating a duplicate (competition checkout). */
  existingPaymentId?: string
}

export interface PaymentService {
  readonly name: PaymentProvider
  createIntent(input: PaymentCreateInput): Promise<CheckoutSession>
  confirm(providerRef: string, opts?: PaymentConfirmOptions): Promise<PaymentIntent>
  refund(paymentId: string): Promise<PaymentIntent>
  getStatus(paymentId: string): Promise<PaymentIntent>
  verifyWebhook?(_payload: unknown): boolean
}

export function getPaymentsMode(): PaymentsMode {
  const mode = process.env.PAYMENTS_MODE
  if (mode === 'test' || mode === 'live') return mode
  return 'pay_at_club'
}

/** Safe ops snapshot — never includes SEP_TERMINAL_ID or other secrets. */
export type PaymentsStatusSnapshot = {
  paymentsMode: PaymentsMode
  resolvedProvider: PaymentProvider
  hasSepTerminalId: boolean
  onlineCheckoutEnabled: boolean
  usesTestGateway: boolean
  liveReady: boolean
  warningCodes: string[]
  warnings: string[]
  nextActionCodes: string[]
  nextActions: string[]
  noteCode: string
  note: string
  callbackPath: string
}

const PAYMENTS_WARNING: Record<string, string> = {
  live_without_terminal:
    'PAYMENTS_MODE=live but SEP_TERMINAL_ID is missing — live SEP checkout will fail',
  pay_at_club_fallback:
    'PAYMENTS_MODE=pay_at_club — online Pay CTA hidden; desk mark-paid / walk-ins OK (OK MVP fallback)',
  test_without_terminal:
    'PAYMENTS_MODE=test without SEP_TERMINAL_ID — checkout uses /payments/test-gateway (simulate OK/NOK)',
}

const PAYMENTS_NEXT: Record<string, string> = {
  keep_pay_at_club: 'Keep PAYMENTS_MODE=pay_at_club until SEP is ready (desk fallback is OK for MVP)',
  use_test_first: 'Prefer PAYMENTS_MODE=test on Liara until SEP terminal verify checklist passes',
  set_terminal: 'Set SEP_TERMINAL_ID from the SEP merchant panel (never commit)',
  verify_then_live:
    'After docs/PAYMENTS.md manual verify passes, set PAYMENTS_MODE=live and restart',
  set_site_url: 'Ensure NUXT_PUBLIC_SITE_URL=https://inboxs.ir so callback resolves correctly',
}

/**
 * Local / admin diagnostics for payments mode after Liara secrets are set.
 * Never returns terminal id or other secrets.
 */
export function getPaymentsStatusSnapshot(): PaymentsStatusSnapshot {
  const paymentsMode = getPaymentsMode()
  const resolvedProvider = resolvePaymentProvider()
  const hasSepTerminalId = Boolean(process.env.SEP_TERMINAL_ID?.trim())
  const onlineCheckoutEnabled = paymentsMode !== 'pay_at_club'
  const usesTestGateway = paymentsMode === 'test' && !hasSepTerminalId && resolvedProvider === 'sep'
  const liveReady = paymentsMode === 'live' && hasSepTerminalId && resolvedProvider === 'sep'

  const warningCodes: string[] = []
  const nextActionCodes: string[] = []

  if (paymentsMode === 'live' && !hasSepTerminalId) {
    warningCodes.push('live_without_terminal')
    nextActionCodes.push('set_terminal')
  }

  if (paymentsMode === 'pay_at_club') {
    warningCodes.push('pay_at_club_fallback')
    nextActionCodes.push('keep_pay_at_club')
  } else if (paymentsMode === 'test') {
    if (!hasSepTerminalId) warningCodes.push('test_without_terminal')
    nextActionCodes.push('use_test_first')
    if (!hasSepTerminalId) nextActionCodes.push('set_terminal')
    nextActionCodes.push('verify_then_live')
  }

  nextActionCodes.push('set_site_url')

  let noteCode = 'pay_at_club'
  let note =
    'Desk-only — online Pay CTA hidden. OK MVP fallback until SEP terminal is verified.'
  if (paymentsMode === 'test') {
    noteCode = usesTestGateway ? 'test_gateway' : 'test_sep'
    note = usesTestGateway
      ? 'Test mode without terminal — /payments/test-gateway. Do not set live yet.'
      : 'Test mode with SEP_TERMINAL_ID — real SEP request/verify. Flip to live only after checklist.'
  } else if (paymentsMode === 'live') {
    noteCode = liveReady ? 'live' : 'live_incomplete'
    note = liveReady
      ? 'Live SEP configured (terminal present). Confirm panel + callback before relying on it.'
      : 'Live mode incomplete — set SEP_TERMINAL_ID or roll back to test / pay_at_club.'
  }

  return {
    paymentsMode,
    resolvedProvider,
    hasSepTerminalId,
    onlineCheckoutEnabled,
    usesTestGateway,
    liveReady,
    warningCodes,
    warnings: warningCodes.map((c) => PAYMENTS_WARNING[c] || c),
    nextActionCodes,
    nextActions: nextActionCodes.map((c) => PAYMENTS_NEXT[c] || c),
    noteCode,
    note,
    callbackPath: '/payments/callback/sep',
  }
}

/**
 * Resolve which payment provider to use.
 * When `explicit` is set (e.g. stored payment.provider on refund/callback),
 * honor it even if current mode is pay_at_club — so historical IPG rows
 * still hit the correct adapter.
 */
export function resolvePaymentProvider(explicit?: string): PaymentProvider {
  if (explicit && ['sep', 'idpay', 'log', 'pay_at_club'].includes(explicit)) {
    return explicit as PaymentProvider
  }
  const mode = getPaymentsMode()
  if (mode === 'pay_at_club') return 'pay_at_club'
  const configured = process.env.PAYMENT_PROVIDER as PaymentProvider | undefined
  if (configured && ['sep', 'idpay', 'log', 'pay_at_club'].includes(configured)) return configured
  // test + live default to SEP (real adapter; simulate gateway when no terminal id).
  // Set PAYMENT_PROVIDER=log for API-only tests without redirect.
  return 'sep'
}
