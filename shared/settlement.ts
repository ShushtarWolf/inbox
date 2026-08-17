/** Default 10% platform fee when PLATFORM_COMMISSION_BPS is unset. */
export const DEFAULT_PLATFORM_COMMISSION_BPS = 1000

export type SettlementSplit = {
  gross: number
  commissionBps: number
  commission: number
  ownerNet: number
}

/** Resolve commission BPS from env (0–10000). Invalid/missing → default. */
export function resolvePlatformCommissionBps(
  raw: string | undefined | null = typeof process !== 'undefined' ? process.env.PLATFORM_COMMISSION_BPS : undefined,
): number {
  if (raw == null || String(raw).trim() === '') return DEFAULT_PLATFORM_COMMISSION_BPS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return DEFAULT_PLATFORM_COMMISSION_BPS
  return Math.floor(n)
}

/** Split gross payment into platform commission + owner net (floor). */
export function splitSettlement(gross: number, commissionBps: number = resolvePlatformCommissionBps()): SettlementSplit {
  const safeGross = Number.isFinite(gross) && gross > 0 ? Math.floor(gross) : 0
  const bps = Number.isFinite(commissionBps) && commissionBps >= 0
    ? Math.min(10_000, Math.floor(commissionBps))
    : DEFAULT_PLATFORM_COMMISSION_BPS
  const commission = Math.floor((safeGross * bps) / 10_000)
  const ownerNet = Math.max(0, safeGross - commission)
  return { gross: safeGross, commissionBps: bps, commission, ownerNet }
}

function toAsciiDigits(input: string) {
  return input
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
}

/** Normalize Iranian SHEBA / IBAN to uppercase IR + 24 digits (no spaces). */
export function normalizeSheba(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = toAsciiDigits(String(raw)).replace(/[\s\-]/g, '').toUpperCase()
  if (!cleaned) return null
  const withIr = cleaned.startsWith('IR') ? cleaned : `IR${cleaned}`
  return withIr
}

/**
 * Iranian IBAN: IR + 24 digits. Mod-97 check on rearranged IBAN.
 * Returns false for empty / malformed.
 */
export function isValidSheba(raw: string | null | undefined): boolean {
  const sheba = normalizeSheba(raw)
  if (!sheba || !/^IR\d{24}$/.test(sheba)) return false

  // Move first 4 chars to end, map letters A=10 … Z=35, mod 97 === 1
  const rearranged = `${sheba.slice(4)}${sheba.slice(0, 4)}`
  let expanded = ''
  for (const ch of rearranged) {
    if (ch >= 'A' && ch <= 'Z') expanded += String(ch.charCodeAt(0) - 55)
    else expanded += ch
  }
  let remainder = 0
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}
