import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractOtpToken, kavenegarSmsProvider } from './kavenegar'
import { getRegisteredSmsProvider } from '../registry'

describe('extractOtpToken', () => {
  it('extracts a 6-digit code from OTP body', () => {
    expect(extractOtpToken('کد تایید inbox: 123456')).toBe('123456')
  })

  it('returns undefined when no standalone 6-digit token exists', () => {
    expect(extractOtpToken('hello')).toBeUndefined()
    expect(extractOtpToken('code 12345')).toBeUndefined()
  })
})

describe('kavenegarSmsProvider', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    process.env.KAVENEGAR_API_KEY = 'test-api-key'
    delete process.env.KAVENEGAR_TEMPLATE
    kavenegarSmsProvider()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.KAVENEGAR_API_KEY
    delete process.env.KAVENEGAR_TEMPLATE
    vi.restoreAllMocks()
  })

  it('registers as live provider', () => {
    expect(getRegisteredSmsProvider('live')?.name).toBe('live')
  })

  it('sends via sms/send.json when no template is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        return: { status: 200, message: 'OK' },
        entries: [{ messageid: 42 }],
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await getRegisteredSmsProvider('live')!.send({
      to: '09121234567',
      body: 'کد تایید inbox: 654321',
    })

    expect(result.sent).toBe(true)
    expect(result.providerRef).toBe('kavenegar-42')
    expect(fetchMock).toHaveBeenCalledOnce()
    const calledUrl = String(fetchMock.mock.calls[0]![0])
    expect(calledUrl).toContain('/v1/test-api-key/sms/send.json')
    expect(calledUrl).toContain('receptor=09121234567')
    expect(calledUrl).toContain('message=')
    expect(calledUrl).toContain('654321')
  })

  it('uses verify/lookup.json when template and OTP token are present', async () => {
    process.env.KAVENEGAR_TEMPLATE = 'inbox-verify'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        return: { status: 200, message: 'OK' },
        entries: [{ messageid: 99 }],
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await getRegisteredSmsProvider('live')!.send({
      to: '09121234567',
      body: 'کد تایید inbox: 111222',
    })

    expect(result.sent).toBe(true)
    expect(result.providerRef).toBe('kavenegar-99')
    const calledUrl = String(fetchMock.mock.calls[0]![0])
    expect(calledUrl).toContain('/verify/lookup.json')
    expect(calledUrl).toContain('token=111222')
    expect(calledUrl).toContain('template=inbox-verify')
  })

  it('falls back to sms/send.json when template is set but body has no OTP', async () => {
    process.env.KAVENEGAR_TEMPLATE = 'inbox-verify'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        return: { status: 200, message: 'OK' },
        entries: [{ messageid: 7 }],
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await getRegisteredSmsProvider('live')!.send({
      to: '09121234567',
      body: 'Slot available tomorrow',
    })

    const calledUrl = String(fetchMock.mock.calls[0]![0])
    expect(calledUrl).toContain('/sms/send.json')
  })

  it('maps network failures to 502 without leaking the raw error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch

    await expect(
      getRegisteredSmsProvider('live')!.send({
        to: '09121234567',
        body: 'کد تایید inbox: 123456',
      }),
    ).rejects.toMatchObject({ statusCode: 502, statusMessage: 'Kavenegar SMS unreachable' })
  })
})
