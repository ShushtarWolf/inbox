import type { Prisma } from '@prisma/client'
import {
  DEFAULT_PLATFORM_COMMISSION_BPS,
  resolveCoachCommissionBps,
  resolveCoachCourtCommissionBps,
  resolvePlatformCommissionBps,
} from '#shared/settlement.ts'

export const PLATFORM_COMMISSION_SETTING_ID = 'default'

const CACHE_MS = 10_000
let cache: { commissionBps: number; coachCourtCommissionBps: number | null; at: number } | null = null

export function invalidatePlatformCommissionCache() {
  cache = null
}

type DbClient = Pick<Prisma.TransactionClient, 'platformCommissionSetting'>

function clampStoredBps(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0 || raw > 10_000) return DEFAULT_PLATFORM_COMMISSION_BPS
  return raw
}

export type PlatformCommissionSettings = {
  commissionBps: number
  /** Null = use half of effective athlete court rate at settlement time. */
  coachCourtCommissionBps: number | null
}

/**
 * Platform default commission settings (DB first, env bootstrap if row missing).
 */
export async function loadPlatformCommissionSettings(db: DbClient = prisma): Promise<PlatformCommissionSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return {
      commissionBps: cache.commissionBps,
      coachCourtCommissionBps: cache.coachCourtCommissionBps,
    }
  }
  try {
    const row = await db.platformCommissionSetting.findUnique({
      where: { id: PLATFORM_COMMISSION_SETTING_ID },
      select: { commissionBps: true, coachCourtCommissionBps: true },
    })
    if (row) {
      const commissionBps = clampStoredBps(row.commissionBps)
      const coachCourtCommissionBps = row.coachCourtCommissionBps == null
        ? null
        : clampStoredBps(row.coachCourtCommissionBps)
      cache = { commissionBps, coachCourtCommissionBps, at: Date.now() }
      return { commissionBps, coachCourtCommissionBps }
    }
  } catch {
    // Prisma mock / pre-migrate tests — fall through to env
  }
  const fromEnv = resolvePlatformCommissionBps()
  cache = { commissionBps: fromEnv, coachCourtCommissionBps: null, at: Date.now() }
  return { commissionBps: fromEnv, coachCourtCommissionBps: null }
}

/** Effective platform default commission for settlement (DB first, env bootstrap if row missing). */
export async function loadPlatformCommissionBps(db: DbClient = prisma): Promise<number> {
  const settings = await loadPlatformCommissionSettings(db)
  return settings.commissionBps
}

export type PlatformCommissionAdminView = {
  commissionBps: number
  coachCourtCommissionBps: number | null
  /** When coachCourtCommissionBps is null: half of commissionBps. */
  effectiveCoachCourtCommissionBps: number
  source: 'database' | 'env_fallback'
  envBootstrapBps: number
  coachCommissionBps: number
  coachUsesEnvOverride: boolean
  warnings: Array<{ code: string; message: string }>
  history: Array<{
    id: string
    fromBps: number
    toBps: number
    actor: string
    ackRefundRisk: boolean
    createdAt: string
  }>
}

const REFUND_RISK_WARNING = {
  code: 'commission_refund_float',
  message:
    'با کمیسیون بیش از ۰٪، در لغو/بازپرداخت سهم پلتفرم از شناور (float) برمی‌گردد — قبل از فعال‌سازی سیاست بازپرداخت را تأیید کنید (ممیزی مالی YELLOW).',
}

export async function buildPlatformCommissionAdminView(): Promise<PlatformCommissionAdminView> {
  const { commissionBps, coachCourtCommissionBps } = await loadPlatformCommissionSettings()
  const effectiveCoachCourtCommissionBps = resolveCoachCourtCommissionBps({
    clubCommissionBps: null,
    platformCommissionBps: commissionBps,
    platformCoachCourtCommissionBps: coachCourtCommissionBps,
    clubCoachCourtCommissionBps: null,
  })
  let source: PlatformCommissionAdminView['source'] = 'database'
  try {
    const row = await prisma.platformCommissionSetting.findUnique({
      where: { id: PLATFORM_COMMISSION_SETTING_ID },
      select: { id: true },
    })
    if (!row) source = 'env_fallback'
  } catch {
    source = 'env_fallback'
  }

  const coachRaw = process.env.COACH_COMMISSION_BPS
  const coachUsesEnvOverride = coachRaw != null && String(coachRaw).trim() !== ''
  const coachCommissionBps = resolveCoachCommissionBps(coachRaw, commissionBps)

  const warnings: PlatformCommissionAdminView['warnings'] = []
  if (commissionBps > 0) warnings.push(REFUND_RISK_WARNING)
  if (coachUsesEnvOverride && coachCommissionBps !== commissionBps) {
    warnings.push({
      code: 'coach_commission_env_override',
      message: 'COACH_COMMISSION_BPS در env جدا از نرخ پیش‌فرض پلتفرم تنظیم شده — فقط در env قابل تغییر است.',
    })
  }

  const historyRows = await prisma.platformCommissionChange.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      fromBps: true,
      toBps: true,
      actor: true,
      ackRefundRisk: true,
      createdAt: true,
    },
  })

  return {
    commissionBps,
    coachCourtCommissionBps,
    effectiveCoachCourtCommissionBps,
    source,
    envBootstrapBps: resolvePlatformCommissionBps(),
    coachCommissionBps,
    coachUsesEnvOverride,
    warnings,
    history: historyRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}
