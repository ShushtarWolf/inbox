import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chunkSmsBodyForToken10,
  extractOtpToken,
  kavenegarSmsProvider,
  resolveNotifyLookupTemplate,
  TOKEN10_MAX,
  TOKEN10_MAX_SPACES,
  toKavenegarToken10,
} from './kavenegar'
import { getRegisteredSmsProvider } from '../registry'

describe('extractOtpToken', () => {
  it('extracts a 6-digit code from OTP body', () => {
    expect(extractOtpToken('کد تایید inbox: 123456')).toBe('123456')
  })

  it('prefers the code: label when the WebOTP line also has digits', () => {
    expect(extractOtpToken(['code: 913717', 'کد تایید اینباکس', '@inboxs.ir #913717'].join('\n'))).toBe('913717')
  })

  it('returns undefined when no standalone 6-digit token exists', () => {
    expect(extractOtpToken('hello')).toBeUndefined()
    expect(extractOtpToken('code 12345')).toBeUndefined()
  })
})

describe('toKavenegarToken10', () => {
  it('strips punctuation, packs to ≤5 spaces, and truncates without ellipsis', () => {
    const out = toKavenegarToken10('a\nb\nc | d | e | f | g | h')
    expect(out).not.toMatch(/[|#*…]/)
    expect((out.match(/ /g) || []).length).toBeLessThanOrEqual(TOKEN10_MAX_SPACES)
    expect(out.length).toBeLessThanOrEqual(TOKEN10_MAX)
    expect(toKavenegarToken10('x'.repeat(120)).length).toBeLessThanOrEqual(TOKEN10_MAX)
    expect(toKavenegarToken10('x'.repeat(120))).not.toContain('…')
  })

  it('accepts the prod admin club-application body that Kavenegar rejected with 431', () => {
    const body =
      'درخواست باشگاه | IInboxSS | تهران | IInboxSS | ۰۹۱۲۸۳۲۸۳۸۰ | اقدام در ادمین | اینباکس'
    const out = toKavenegarToken10(body)
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThanOrEqual(TOKEN10_MAX)
    expect((out.match(/ /g) || []).length).toBeLessThanOrEqual(TOKEN10_MAX_SPACES)
    expect(out).toMatch(/IInboxSS/)
    expect(out).toMatch(/اینباکس|ادمین|تهران|درخواست/)
  })

  it('strips URL punctuation so token10 cannot carry a tappable https link', () => {
    const body = [
      'صاحب باشگاه عزیز',
      'شما از سایت اینباکس رزرو دارید',
      '',
      'https://inboxs.ir/owner/calendar',
    ].join('\n')
    const out = toKavenegarToken10(body)
    expect(out).not.toContain('://')
    expect(out).not.toContain('/')
    expect(out).not.toContain('.')
    expect(out.length).toBeLessThanOrEqual(TOKEN10_MAX)
    expect((out.match(/ /g) || []).length).toBeLessThanOrEqual(TOKEN10_MAX_SPACES)
  })

  it('strips fa-IR thousand separators from withdraw amounts', () => {
    const body =
      'برداشت ورزشکار | الهه ربیعی | ۵۰٬۰۰۰ تومان | شبا ۹۲۰۱ | اقدام در ادمین | اینباکس'
    const out = toKavenegarToken10(body)
    expect(out).not.toContain('٬')
    expect(out).not.toContain('|')
    expect((out.match(/ /g) || []).length).toBeLessThanOrEqual(TOKEN10_MAX_SPACES)
  })
})

describe('chunkSmsBodyForToken10', () => {
  it('keeps a short body as one chunk', () => {
    expect(chunkSmsBodyForToken10('خط یک\nخط دو')).toEqual(['خط یک\nخط دو'])
  })

  it('splits long multi-line digests so each chunk fits token10', () => {
    const body = Array.from({ length: 12 }, (_, i) =>
      `رزرو زمین شماره ${i + 1} مهمان طولانی نام خانوادگی تست ${i + 1}`,
    ).join('\n')
    const chunks = chunkSmsBodyForToken10(body)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      const token = toKavenegarToken10(chunk)
      expect(token.length).toBeLessThanOrEqual(TOKEN10_MAX)
      expect((token.match(/ /g) || []).length).toBeLessThanOrEqual(TOKEN10_MAX_SPACES)
    }
  })
})

describe('kavenegarSmsProvider', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    process.env.KAVENEGAR_API_KEY = 'test-api-key'
    delete process.env.KAVENEGAR_TEMPLATE
    delete process.env.KAVENEGAR_TEMPLATE_NOTIFY
    delete process.env.KAVENEGAR_SENDER
    kavenegarSmsProvider()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.KAVENEGAR_API_KEY
    delete process.env.KAVENEGAR_TEMPLATE
    delete process.env.KAVENEGAR_TEMPLATE_NOTIFY
    delete process.env.KAVENEGAR_SENDER
    vi.restoreAllMocks()
  })

  it('registers as live provider', () => {
    expect(getRegisteredSmsProvider('live')?.name).toBe('live')
  })

  it('defaults notify lookup template to inbox-notify', () => {
    expect(resolveNotifyLookupTemplate()).toBe('inbox-notify')
    process.env.KAVENEGAR_TEMPLATE_NOTIFY = 'custom-notify'
    expect(resolveNotifyLookupTemplate()).toBe('custom-notify')
  })

  it('sends OTP via sms/send.json when no OTP template is configured', async () => {
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
      purpose: 'otp',
    })

    expect(result.sent).toBe(true)
    expect(result.providerRef).toBe('kavenegar-42')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [calledUrl, init] = fetchMock.mock.calls[0]!
    expect(String(calledUrl)).toContain('/v1/test-api-key/sms/send.json')
    expect(init?.method).toBe('POST')
  })

  it('uses verify/lookup.json for OTP purpose when template is set', async () => {
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
      purpose: 'otp',
    })

    expect(result.sent).toBe(true)
    expect(result.providerRef).toBe('kavenegar-99')
    const calledUrl = String(fetchMock.mock.calls[0]![0])
    expect(calledUrl).toContain('/verify/lookup.json')
    expect(calledUrl).toContain('token=111222')
    expect(calledUrl).toContain('token2=111222')
    expect(calledUrl).toContain('template=inbox-verify')
  })

  it('uses verify/lookup token10 for notify (not OTP template)', async () => {
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
      body: 'پرداخت رزرو ثبت شد «بهناز» — امروز. اینباکس',
      purpose: 'notify',
      template: 'BOOKING_PAID',
    })

    const calledUrl = String(fetchMock.mock.calls[0]![0])
    expect(calledUrl).toContain('/verify/lookup.json')
    expect(calledUrl).toContain('template=inbox-notify')
    expect(calledUrl).toContain('token10=')
    expect(calledUrl).not.toContain('template=inbox-verify')
  })

  it('falls back to sms/send.json when OTP template is set but body has no OTP', async () => {
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
      purpose: 'otp',
    })

    const [calledUrl, init] = fetchMock.mock.calls[0]!
    expect(String(calledUrl)).toContain('/sms/send.json')
    expect(init?.method).toBe('POST')
  })

  it('bulk CRM uses notify lookup per recipient', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        return: { status: 200, message: 'OK' },
        entries: [{ messageid: 55 }],
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await getRegisteredSmsProvider('live')!.sendBulk({
      recipients: [{ phone: '09121111111' }, { phone: '09122222222' }],
      body: 'سلام باشگاه',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const calledUrl = String(fetchMock.mock.calls[0]![0])
    expect(calledUrl).toContain('/verify/lookup.json')
    expect(calledUrl).toContain('template=inbox-notify')
  })

  it('maps invalid-sender failures to a clear 502 hint', async () => {
    process.env.KAVENEGAR_TEMPLATE_NOTIFY = ''
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        return: { status: 412, message: 'ارسال کننده نامعتبر است' },
      }),
    }) as unknown as typeof fetch

    await expect(
      getRegisteredSmsProvider('live')!.send({
        to: '09121234567',
        body: 'کد تایید inbox: 123456',
        purpose: 'otp',
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: expect.stringContaining('invalid sender'),
    })
  })

  it('maps network failures to 502 without leaking the raw error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch

    await expect(
      getRegisteredSmsProvider('live')!.send({
        to: '09121234567',
        body: 'کد تایید inbox: 123456',
        purpose: 'otp',
      }),
    ).rejects.toMatchObject({ statusCode: 502, statusMessage: 'Kavenegar SMS unreachable' })
  })
})
