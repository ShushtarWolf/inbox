import { describe, expect, it, vi } from 'vitest'
import {
  assertCompetitionStatusTransition,
  assertEntryStatusTransition,
  assertFreeEntryAllowed,
  canCancelCompetitionEntry,
  canCompetitionStatusTransition,
  competitionJoinIdempotencyKey,
  competitionPrizeIdempotencyKey,
  competitionPrizeWalletNote,
  getCompetitionsPilotClubSlug,
  isCompetitionPayAtClubAllowed,
  isCompetitionsEnabled,
  isCompetitionsVisibleForClub,
  isPaymentLinkedForEntryConfirm,
  normalizeCompetitionsPilotClubSlug,
  resolveEntryPrizeStatus,
  validatePrizeConfig,
} from './competition'
import { PILOT_CLUB_SLUG } from './pilotClub'

describe('competition status transitions', () => {
  it('allows DRAFT → OPEN → CLOSED → IN_PROGRESS → COMPLETED', () => {
    expect(canCompetitionStatusTransition('DRAFT', 'OPEN')).toBe(true)
    expect(canCompetitionStatusTransition('OPEN', 'CLOSED')).toBe(true)
    expect(canCompetitionStatusTransition('CLOSED', 'IN_PROGRESS')).toBe(true)
    expect(canCompetitionStatusTransition('IN_PROGRESS', 'COMPLETED')).toBe(true)
    expect(() => assertCompetitionStatusTransition('DRAFT', 'OPEN')).not.toThrow()
    expect(() => assertCompetitionStatusTransition('IN_PROGRESS', 'COMPLETED')).not.toThrow()
  })

  it('rejects skipping states (DRAFT → COMPLETED)', () => {
    expect(canCompetitionStatusTransition('DRAFT', 'COMPLETED')).toBe(false)
    expect(() => assertCompetitionStatusTransition('DRAFT', 'COMPLETED')).toThrow(
      'Invalid competition status transition: DRAFT → COMPLETED',
    )
  })

  it('allows cancel from non-terminal states', () => {
    expect(canCompetitionStatusTransition('OPEN', 'CANCELLED')).toBe(true)
    expect(canCompetitionStatusTransition('IN_PROGRESS', 'CANCELLED')).toBe(true)
    expect(canCompetitionStatusTransition('COMPLETED', 'CANCELLED')).toBe(false)
  })

  it('enforces entry status machine', () => {
    expect(() => assertEntryStatusTransition('PENDING', 'CONFIRMED')).not.toThrow()
    expect(() => assertEntryStatusTransition('CONFIRMED', 'REFUNDED')).not.toThrow()
    expect(() => assertEntryStatusTransition('PENDING', 'REFUNDED')).toThrow(
      'Invalid entry status transition: PENDING → REFUNDED',
    )
  })
})

describe('prize config validation', () => {
  it('accepts WALLET placements with positive amounts', () => {
    const config = validatePrizeConfig('WALLET', {
      placements: [{ placement: 1, amount: 500000 }, { placement: 2, amount: 250000 }],
    })
    expect(config.placements).toHaveLength(2)
    expect(config.placements[0].amount).toBe(500000)
  })

  it('accepts DISCOUNT placements with percent 1–100', () => {
    const config = validatePrizeConfig('DISCOUNT', {
      placements: [{ placement: 1, percent: 20 }],
    })
    expect(config.placements[0].percent).toBe(20)
  })

  it('rejects invalid prize config', () => {
    expect(() => validatePrizeConfig('WALLET', { placements: [] })).toThrow(
      'at least one placement required',
    )
    expect(() => validatePrizeConfig('DISCOUNT', {
      placements: [{ placement: 1, percent: 0 }],
    })).toThrow('percent 1–100')
  })

  it('rejects WALLET amounts above per-placement cap', () => {
    expect(() => validatePrizeConfig('WALLET', {
      placements: [{ placement: 1, amount: 20_000_000 }],
    })).toThrow('exceeds cap')
  })

  it('rejects WALLET total above competition cap', () => {
    expect(() => validatePrizeConfig('WALLET', {
      placements: [
        { placement: 1, amount: 9_000_000 },
        { placement: 2, amount: 9_000_000 },
        { placement: 3, amount: 9_000_000 },
        { placement: 4, amount: 9_000_000 },
        { placement: 5, amount: 9_000_000 },
        { placement: 6, amount: 9_000_000 },
      ],
    })).toThrow('total exceeds cap')
  })
})

describe('prize idempotency helpers', () => {
  it('builds stable keys and wallet notes', () => {
    expect(competitionPrizeIdempotencyKey('c1', 'e1', 1)).toBe('competition:c1:entry:e1:place:1')
    expect(competitionPrizeWalletNote('c1', 1)).toBe('competition:c1:place:1')
  })
})

describe('entry prize status', () => {
  it('returns pending when placed and completed but not awarded', () => {
    expect(resolveEntryPrizeStatus({
      placement: 1,
      competitionStatus: 'COMPLETED',
      prizesAwardedAt: null,
      hasAward: false,
    })).toBe('pending')
  })

  it('returns credited when award exists', () => {
    expect(resolveEntryPrizeStatus({
      placement: 1,
      competitionStatus: 'COMPLETED',
      prizesAwardedAt: new Date(),
      hasAward: true,
    })).toBe('credited')
  })
})

describe('free entry rules', () => {
  it('requires sponsorFunded when entry fee is zero', () => {
    expect(() => assertFreeEntryAllowed(0, false)).toThrow('sponsorFunded')
    expect(() => assertFreeEntryAllowed(0, true)).not.toThrow()
    expect(() => assertFreeEntryAllowed(100000, false)).not.toThrow()
  })
})

describe('payment confirmation rules', () => {
  it('confirms only on PAID status for paid entries', () => {
    expect(isPaymentLinkedForEntryConfirm({ status: 'PAID', amount: 200000 }, 200000)).toBe(true)
    expect(isPaymentLinkedForEntryConfirm({ status: 'PAY_AT_CLUB', amount: 200000 }, 200000)).toBe(false)
    expect(isPaymentLinkedForEntryConfirm({ status: 'PENDING_AT_CLUB', amount: 200000 }, 200000)).toBe(false)
    expect(isPaymentLinkedForEntryConfirm(null, 200000)).toBe(false)
    expect(isPaymentLinkedForEntryConfirm({ status: 'PAID', amount: 100000 }, 200000)).toBe(false)
  })

  it('skips payment check for free entries', () => {
    expect(isPaymentLinkedForEntryConfirm(null, 0)).toBe(true)
  })
})

describe('join idempotency key', () => {
  it('is stable per competition and athlete', () => {
    expect(competitionJoinIdempotencyKey('c1', 'a1')).toBe('competition-entry:c1:a1')
    expect(competitionJoinIdempotencyKey('c1', 'a1')).toBe(competitionJoinIdempotencyKey('c1', 'a1'))
  })
})

describe('cancellation window', () => {
  it('allows cancel when event is far enough ahead', () => {
    const eventAt = new Date('2026-12-01T10:00:00Z')
    const now = new Date('2026-08-01T10:00:00Z')
    expect(canCancelCompetitionEntry(eventAt, 12, now)).toBe(true)
  })

  it('blocks cancel inside window', () => {
    const eventAt = new Date('2026-08-01T14:00:00Z')
    const now = new Date('2026-08-01T10:00:00Z')
    expect(canCancelCompetitionEntry(eventAt, 12, now)).toBe(false)
  })
})

describe('pay at club policy', () => {
  it('follows platform payment mode', () => {
    process.env.PAYMENTS_MODE = 'pay_at_club'
    expect(isCompetitionPayAtClubAllowed()).toBe(true)
    process.env.PAYMENTS_MODE = 'test'
    expect(isCompetitionPayAtClubAllowed()).toBe(false)
    delete process.env.PAYMENTS_MODE
  })
})

describe('competition pilot gate', () => {
  const gateKeys = [
    'COMPETITIONS_ENABLED',
    'NUXT_PUBLIC_COMPETITIONS_ENABLED',
    'COMPETITIONS_PILOT_CLUB_SLUG',
    'NUXT_PUBLIC_COMPETITIONS_PILOT_CLUB_SLUG',
  ] as const

  function withGateEnv(env: Partial<NodeJS.ProcessEnv>, fn: () => void) {
    const saved = Object.fromEntries(gateKeys.map((key) => [key, process.env[key]]))
    for (const key of gateKeys) delete process.env[key]
    Object.assign(process.env, env)
    try {
      fn()
    } finally {
      for (const key of gateKeys) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
      }
    }
  }

  it('defaults to disabled', () => {
    withGateEnv({}, () => {
      expect(isCompetitionsEnabled()).toBe(false)
      expect(isCompetitionsVisibleForClub(PILOT_CLUB_SLUG)).toBe(false)
      expect(getCompetitionsPilotClubSlug()).toBeNull()
    })
  })

  it('enables globally when COMPETITIONS_ENABLED=true', () => {
    withGateEnv({ COMPETITIONS_ENABLED: 'true' }, () => {
      expect(isCompetitionsEnabled()).toBe(true)
      expect(isCompetitionsVisibleForClub(PILOT_CLUB_SLUG)).toBe(true)
      expect(isCompetitionsVisibleForClub('other')).toBe(true)
    })
  })

  it('restricts to PILOT_CLUB_SLUG when set', () => {
    withGateEnv({
      COMPETITIONS_ENABLED: 'true',
      COMPETITIONS_PILOT_CLUB_SLUG: PILOT_CLUB_SLUG,
    }, () => {
      expect(getCompetitionsPilotClubSlug()).toBe(PILOT_CLUB_SLUG)
      expect(isCompetitionsVisibleForClub(PILOT_CLUB_SLUG)).toBe(true)
      // Short alias is not a club slug — must not silently match the live club.
      expect(isCompetitionsVisibleForClub('iust')).toBe(false)
      expect(isCompetitionsVisibleForClub('other')).toBe(false)
      expect(isCompetitionsVisibleForClub('')).toBe(false)
    })
  })

  it('maps legacy env alias iust → PILOT_CLUB_SLUG with a one-line warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      withGateEnv({
        COMPETITIONS_ENABLED: 'true',
        COMPETITIONS_PILOT_CLUB_SLUG: 'iust',
      }, () => {
        expect(getCompetitionsPilotClubSlug()).toBe(PILOT_CLUB_SLUG)
        expect(isCompetitionsVisibleForClub(PILOT_CLUB_SLUG)).toBe(true)
        expect(isCompetitionsVisibleForClub('iust')).toBe(false)
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`COMPETITIONS_PILOT_CLUB_SLUG="iust" is a legacy alias`),
        )
      })
    } finally {
      warn.mockRestore()
    }
  })

  it('maps legacy env alias بهناز → PILOT_CLUB_SLUG', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(normalizeCompetitionsPilotClubSlug('بهناز')).toBe(PILOT_CLUB_SLUG)
      expect(isCompetitionsVisibleForClub(PILOT_CLUB_SLUG, {
        enabled: true,
        pilotClubSlug: 'بهناز',
      })).toBe(true)
      expect(isCompetitionsVisibleForClub('بهناز', {
        enabled: true,
        pilotClubSlug: 'بهناز',
      })).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })

  it('accepts explicit runtime overrides with canonical slug', () => {
    withGateEnv({}, () => {
      expect(isCompetitionsEnabled({ enabled: true, pilotClubSlug: PILOT_CLUB_SLUG })).toBe(true)
      expect(isCompetitionsVisibleForClub(PILOT_CLUB_SLUG, {
        enabled: true,
        pilotClubSlug: PILOT_CLUB_SLUG,
      })).toBe(true)
      expect(isCompetitionsVisibleForClub('other', {
        enabled: true,
        pilotClubSlug: PILOT_CLUB_SLUG,
      })).toBe(false)
      expect(isCompetitionsVisibleForClub('iust', {
        enabled: true,
        pilotClubSlug: PILOT_CLUB_SLUG,
      })).toBe(false)
    })
  })
})
