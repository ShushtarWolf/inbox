/**
 * Pure SEP verify binding. IO (verify call, reverse, status writes) stays in sepConfirm.
 *
 * A success code is not enough: the rial amount must match, and when SEP echoes a
 * ResNum it must be this payment's providerRef.
 *
 * Real SEP VerifyTransaction bodies do NOT carry ResNum: TransactionDetail is
 * { RRN, RefNum, MaskedPan, HashedPan, TerminalNumber, OrginalAmount, AffectiveAmount,
 *   StraceDate, StraceNo }. The RefNum arrives on the callback together with our ResNum,
 * so a body without ResNum is bound by: same terminal + exact rial amount. The unique
 * Payment.gatewayRef index stops one RefNum from ever paying two rows.
 * A RefNum already stored on this row is the only case where a thin duplicate-verify
 * body (code 2, amount omitted) may complete.
 */

export type SepVerifyBindInput = {
  resultCode: number
  /** ResNum echoed by VerifyTransaction. Empty when the field is missing. */
  resNum?: string | null
  /** Rials. Null when TransactionDetail omitted the amount. */
  amountRials?: number | null
  expectedResNum: string
  expectedRials: number
  /** Toman stored on Payment.amount — used only to detect a unit mix-up. */
  expectedToman: number
  refNum: string
  storedGatewayRef?: string | null
  /** Rials previously accepted for storedGatewayRef. */
  storedVerifiedRials?: number | null
  /** TerminalNumber echoed in TransactionDetail, when present. */
  terminalNumber?: number | null
  /** Our SEP terminal (SEP_TERMINAL_ID). */
  expectedTerminal?: number | null
}

export type SepVerifyBindResult =
  | { action: 'paid' }
  | { action: 'declined' }
  /** Verify succeeded for a different order. Do not reverse and do not fail this row. */
  | { action: 'reject_foreign' }
  /** Our order, but this body cannot prove the amount. Retry; do not reverse. */
  | { action: 'retry_incomplete' }
  /** Our order, amount present and wrong. Reverse this RefNum, then fail closed. */
  | { action: 'reverse_ours' }

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function bindSepVerify(input: SepVerifyBindInput): SepVerifyBindResult {
  if (input.resultCode !== 0 && input.resultCode !== 2) return { action: 'declined' }

  const resNum = clean(input.resNum)
  const expectedRes = clean(input.expectedResNum)
  const storedRef = clean(input.storedGatewayRef)
  const refNum = clean(input.refNum)
  const ownsRef = Boolean(storedRef) && storedRef === refNum
  const resNumMatches = Boolean(resNum) && resNum === expectedRes

  if (resNum && !resNumMatches) return { action: 'reject_foreign' }
  const terminalKnown = input.terminalNumber != null && Number.isFinite(input.terminalNumber)
    && input.expectedTerminal != null && Number.isFinite(input.expectedTerminal)
  if (terminalKnown && input.terminalNumber !== input.expectedTerminal) return { action: 'reject_foreign' }

  const amount = input.amountRials
  const amountKnown = amount != null && Number.isFinite(amount)
  if (!amountKnown) {
    if (
      ownsRef
      && input.storedVerifiedRials != null
      && Number.isFinite(input.storedVerifiedRials)
      && input.storedVerifiedRials === input.expectedRials
    ) {
      return { action: 'paid' }
    }
    return { action: 'retry_incomplete' }
  }

  const unitSmell = input.expectedToman > 0
    && amount === input.expectedToman
    && amount !== input.expectedRials
  if (amount !== input.expectedRials || unitSmell) {
    // Without a ResNum echo we cannot prove a wrong-amount capture is ours: never reverse it.
    if (resNumMatches || ownsRef) return { action: 'reverse_ours' }
    return { action: 'reject_foreign' }
  }

  return { action: 'paid' }
}

/**
 * Thrown verify errors are transport or an unreadable HTTP body.
 * Business declines arrive as ResultCode on HTTP 200 and are not thrown.
 * Those throws stay retryable: a dropped response may already have captured.
 */
export function isSepVerifyTransportError(err: unknown): boolean {
  if (err == null) return true
  return true
}
