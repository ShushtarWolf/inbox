import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLATFORM_COMMISSION_BPS,
  isSettlementCashoutEligible,
  isValidSheba,
  normalizeSheba,
  resolveCoachCommissionBps,
  resolvePlatformCommissionBps,
  splitSettlement,
  sumEligibleSettlementNet,
} from './settlement.ts'

describe('splitSettlement', () => {
  it('applies 10% default commission with floor', () => {
    expect(splitSettlement(500_000, 1000)).toEqual({
      gross: 500_000,
      commissionBps: 1000,
      commission: 50_000,
      ownerNet: 450_000,
    })
  })

  it('floors commission on non-divisible amounts', () => {
    expect(splitSettlement(1001, 1000)).toEqual({
      gross: 1001,
      commissionBps: 1000,
      commission: 100,
      ownerNet: 901,
    })
  })

  it('supports zero commission (pilot)', () => {
    expect(splitSettlement(400_000, 0)).toEqual({
      gross: 400_000,
      commissionBps: 0,
      commission: 0,
      ownerNet: 400_000,
    })
  })

  it('clamps 100% commission so owner net is zero', () => {
    expect(splitSettlement(250_000, 10_000)).toEqual({
      gross: 250_000,
      commissionBps: 10_000,
      commission: 250_000,
      ownerNet: 0,
    })
  })

  it('treats non-positive gross as zero split', () => {
    expect(splitSettlement(0, 1000)).toEqual({
      gross: 0,
      commissionBps: 1000,
      commission: 0,
      ownerNet: 0,
    })
    expect(splitSettlement(-50, 1000).gross).toBe(0)
  })

  it('clawback amount equals previously credited ownerNet', () => {
    const paid = splitSettlement(600_000, 1000)
    const clawback = paid.ownerNet
    expect(clawback).toBe(540_000)
    expect(paid.commission + clawback).toBe(paid.gross)
  })
})

describe('isSettlementCashoutEligible', () => {
  const now = new Date('2026-08-30T12:00:00+03:30')

  it('allows null/blank classDate immediately', () => {
    expect(isSettlementCashoutEligible(null, now)).toBe(true)
    expect(isSettlementCashoutEligible('', now)).toBe(true)
    expect(isSettlementCashoutEligible('  ', now)).toBe(true)
  })

  it('holds same-day and future classes; releases day after', () => {
    expect(isSettlementCashoutEligible('2026-08-30', now)).toBe(false)
    expect(isSettlementCashoutEligible('2026-08-31', now)).toBe(false)
    expect(isSettlementCashoutEligible('2026-08-29', now)).toBe(true)
  })
})

describe('sumEligibleSettlementNet', () => {
  const now = new Date('2026-08-30T12:00:00+03:30')

  it('splits eligible vs pending and skips clawed rows', () => {
    expect(sumEligibleSettlementNet([
      { ownerNet: 100_000, classDate: '2026-08-29' },
      { ownerNet: 50_000, classDate: '2026-08-30' },
      { ownerNet: 25_000, classDate: null },
      { ownerNet: 10_000, classDate: '2026-08-20', clawedBackAt: new Date() },
    ], now)).toEqual({ eligible: 125_000, pending: 50_000 })
  })
})

describe('resolvePlatformCommissionBps', () => {
  it('defaults when unset or invalid', () => {
    expect(resolvePlatformCommissionBps(undefined)).toBe(DEFAULT_PLATFORM_COMMISSION_BPS)
    expect(resolvePlatformCommissionBps('')).toBe(DEFAULT_PLATFORM_COMMISSION_BPS)
    expect(resolvePlatformCommissionBps('nope')).toBe(DEFAULT_PLATFORM_COMMISSION_BPS)
    expect(resolvePlatformCommissionBps('-1')).toBe(DEFAULT_PLATFORM_COMMISSION_BPS)
    expect(resolvePlatformCommissionBps('20000')).toBe(DEFAULT_PLATFORM_COMMISSION_BPS)
  })

  it('parses valid BPS', () => {
    expect(resolvePlatformCommissionBps('0')).toBe(0)
    expect(resolvePlatformCommissionBps('500')).toBe(500)
    expect(resolvePlatformCommissionBps('10000')).toBe(10_000)
  })
})

describe('resolveCoachCommissionBps', () => {
  it('falls back to platform / default when coach env unset', () => {
    expect(resolveCoachCommissionBps(undefined, undefined)).toBe(DEFAULT_PLATFORM_COMMISSION_BPS)
    expect(resolveCoachCommissionBps('', '500')).toBe(500)
    expect(resolveCoachCommissionBps(undefined, '0')).toBe(0)
  })

  it('uses explicit coach BPS when set', () => {
    expect(resolveCoachCommissionBps('1000', '500')).toBe(1000)
    expect(resolveCoachCommissionBps('0', '1000')).toBe(0)
  })
})

describe('SHEBA helpers', () => {
  const VALID = 'IR060170000000000000000000'
  const VALID_FA_DIGITS = 'IR۰۶۰۱۷۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰'
  const VALID_AR_DIGITS = 'IR٠٦٠١٧٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠'

  it('normalizes spaces and lowercase', () => {
    expect(normalizeSheba(' ir06 0170 0000 0000 0000 0000 00 ')).toBe(VALID)
    expect(normalizeSheba('060170000000000000000000')).toBe(VALID)
  })

  it('normalizes Persian and Arabic-Indic digits', () => {
    expect(normalizeSheba(VALID_FA_DIGITS)).toBe(VALID)
    expect(normalizeSheba(VALID_AR_DIGITS)).toBe(VALID)
    expect(isValidSheba(VALID_FA_DIGITS)).toBe(true)
    expect(isValidSheba(VALID_AR_DIGITS)).toBe(true)
  })

  it('accepts Persian digits with spaces and without IR prefix', () => {
    expect(normalizeSheba(' ۰۶۰۱۷۰ ۰۰۰۰ ۰۰۰۰ ۰۰۰۰ ۰۰۰۰ ۰۰ ')).toBe(VALID)
    expect(isValidSheba('۰۶۰۱۷۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰')).toBe(true)
  })

  it('rejects malformed SHEBA', () => {
    expect(isValidSheba(null)).toBe(false)
    expect(isValidSheba('')).toBe(false)
    expect(isValidSheba('IR123')).toBe(false)
    expect(isValidSheba('IR000170000000000000000001')).toBe(false)
    expect(isValidSheba('IR۰۰۰۱۷۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۱')).toBe(false)
  })

  it('accepts mod-97 valid Iranian SHEBA', () => {
    expect(isValidSheba(VALID)).toBe(true)
    expect(isValidSheba(VALID.toLowerCase())).toBe(true)
    expect(isValidSheba('IR062960000000100324200001')).toBe(true)
  })
})
