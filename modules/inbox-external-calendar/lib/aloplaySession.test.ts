import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAloPlayPublicHeaders,
  buildAuthenticationBody,
  formatGregorianDateInTimeZone,
  needsAloPlaySession,
  parseAuthenticationResponse,
  resolveAloPlayCredentials,
} from './aloplaySession'
import { fetchAloPlayApiJson, loginAloPlayWithFetch } from './aloplaySessionClient'

describe('resolveAloPlayCredentials', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null when env is missing', () => {
    expect(resolveAloPlayCredentials({})).toBeNull()
  })

  it('reads ALOPLAY_* env vars', () => {
    expect(
      resolveAloPlayCredentials({
        ALOPLAY_MOBILE: '09121234567',
        ALOPLAY_PASSWORD: 'secret',
        ALOPLAY_DIAL_CODE: '98',
      }),
    ).toEqual({
      mobile: '09121234567',
      password: 'secret',
      dialCode: '98',
    })
  })

  it('falls back to NUXT_ALOPLAY_* env vars', () => {
    expect(
      resolveAloPlayCredentials({
        NUXT_ALOPLAY_MOBILE: '09129876543',
        NUXT_ALOPLAY_PASSWORD: 'nuxt-secret',
      }),
    ).toEqual({
      mobile: '09129876543',
      password: 'nuxt-secret',
      dialCode: '98',
    })
  })
})

describe('needsAloPlaySession', () => {
  const now = new Date('2026-08-30T10:00:00.000Z')
  const today = formatGregorianDateInTimeZone(now, 'Asia/Tehran')
  const credEnv = {
    ALOPLAY_MOBILE: '09121234567',
    ALOPLAY_PASSWORD: 'secret',
  }

  it('does not require session for today when credentials are missing', () => {
    expect(needsAloPlaySession(today, now, {})).toBe(false)
  })

  it('requires session for future dates when credentials are missing', () => {
    expect(needsAloPlaySession('2026-08-31', now, {})).toBe(true)
  })

  it('requires session for today when credentials are set', () => {
    expect(needsAloPlaySession(today, now, credEnv)).toBe(true)
  })

  it('requires session for future dates when credentials are set', () => {
    expect(needsAloPlaySession('2026-09-04', now, credEnv)).toBe(true)
  })
})

describe('parseAuthenticationResponse', () => {
  it('parses a successful login payload', () => {
    expect(
      parseAuthenticationResponse({
        statusCode: 0,
        data: {
          message: 'Success',
          token: 'abc123',
          expiration: '2026-08-30T18:00:00Z',
        },
      }),
    ).toEqual({
      session: { token: 'abc123', expiration: '2026-08-30T18:00:00Z' },
    })
  })

  it('returns error for HTTP 401-style payload without throwing', () => {
    expect(parseAuthenticationResponse({ statusCode: 401, message: 'Unauthorized' })).toEqual({
      error: 'Unauthorized',
    })
  })
})

describe('loginAloPlayWithFetch', () => {
  it('returns error on 401 without throwing', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url)
      if (target.includes('IsExsist')) {
        return new Response(JSON.stringify({ statusCode: 0, data: true }), { status: 200 })
      }
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual(
        buildAuthenticationBody({
          mobile: '09121234567',
          password: 'secret',
          dialCode: '98',
        }),
      )
      return new Response(JSON.stringify({ statusCode: 401, message: 'Unauthorized' }), {
        status: 401,
      })
    })

    const result = await loginAloPlayWithFetch(fetchImpl as typeof fetch, {
      mobile: '09121234567',
      password: 'secret',
      dialCode: '98',
    })

    expect(result.session).toBeUndefined()
    expect(result.error).toBe('Authentication HTTP 401')
  })
})

describe('fetchAloPlayApiJson', () => {
  const credentials = {
    mobile: '09121234567',
    password: 'secret',
    dialCode: '98',
  }

  it('uses public headers when auth is not required', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject(buildAloPlayPublicHeaders())
      expect(init?.headers).not.toHaveProperty('Authorization')
      return new Response(JSON.stringify({ statusCode: 0, data: [] }), { status: 200 })
    })

    const result = await fetchAloPlayApiJson(
      fetchImpl as typeof fetch,
      'v1/PublicClub/GetAvailableTime',
      { clubId: 10887, date: '2026-08-30', productGender: 2 },
      { requireAuth: false, credentials: null, cache: null },
    )

    expect(result.usedAuth).toBe(false)
    expect(result.payload).toEqual({ statusCode: 0, data: [] })
  })

  it('calls GetAvailableTime with Bearer token for today when credentials are set', async () => {
    let authHeader = ''
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url)
      if (target.includes('Authentication')) {
        return new Response(
          JSON.stringify({
            statusCode: 0,
            data: { message: 'Success', token: 'session-token' },
          }),
          { status: 200 },
        )
      }
      authHeader = String((init?.headers as Record<string, string>).Authorization || '')
      expect(target).toContain('GetAvailableTime')
      expect(target).toContain('date=2026-08-30')
      return new Response(
        JSON.stringify({
          statusCode: 0,
          data: [{ fromTime: '17:00:00', toTime: '18:00:00', productId: 56921 }],
        }),
        { status: 200 },
      )
    })

    const cache = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
    }

    const result = await fetchAloPlayApiJson(
      fetchImpl as typeof fetch,
      'v1/PublicClub/GetAvailableTime',
      { clubId: 10887, date: '2026-08-30', productGender: 2 },
      { requireAuth: true, credentials, cache },
    )

    expect(result.usedAuth).toBe(true)
    expect(authHeader).toBe('Bearer session-token')
    expect(result.payload).toMatchObject({ statusCode: 0 })
    expect(cache.write).toHaveBeenCalled()
  })

  it('calls GetAvailableTime with Bearer token for future dates', async () => {
    let authHeader = ''
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url)
      if (target.includes('Authentication')) {
        return new Response(
          JSON.stringify({
            statusCode: 0,
            data: { message: 'Success', token: 'session-token' },
          }),
          { status: 200 },
        )
      }
      authHeader = String((init?.headers as Record<string, string>).Authorization || '')
      expect(target).toContain('GetAvailableTime')
      expect(target).toContain('date=2026-08-31')
      return new Response(
        JSON.stringify({
          statusCode: 0,
          data: [{ fromTime: '17:00:00', toTime: '18:00:00', productId: 56921 }],
        }),
        { status: 200 },
      )
    })

    const cache = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
    }

    const result = await fetchAloPlayApiJson(
      fetchImpl as typeof fetch,
      'v1/PublicClub/GetAvailableTime',
      { clubId: 10887, date: '2026-08-31', productGender: 2 },
      { requireAuth: true, credentials, cache },
    )

    expect(result.usedAuth).toBe(true)
    expect(authHeader).toBe('Bearer session-token')
    expect(result.payload).toMatchObject({ statusCode: 0 })
    expect(cache.write).toHaveBeenCalled()
  })

  it('hits IsExsist before Authentication when logging in', async () => {
    const seen: string[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url)
      seen.push(target)
      if (target.includes('IsExsist')) {
        expect(target).toContain('v1/User/IsExsist')
        expect(target).toContain('mobile=09121234567')
        return new Response(JSON.stringify({ statusCode: 0, data: true }), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          statusCode: 0,
          data: { message: 'Success', token: 'session-token' },
        }),
        { status: 200 },
      )
    })

    await fetchAloPlayApiJson(
      fetchImpl as typeof fetch,
      'v1/PublicClub/GetAvailableTime',
      { clubId: 10887, date: '2026-08-31', productGender: 2 },
      {
        requireAuth: true,
        credentials,
        cache: {
          read: async () => null,
          write: async () => undefined,
          clear: async () => undefined,
        },
      },
    )

    expect(seen.some((url) => url.includes('IsExsist'))).toBe(true)
    expect(seen.some((url) => url.includes('Authentication'))).toBe(true)
  })
})
