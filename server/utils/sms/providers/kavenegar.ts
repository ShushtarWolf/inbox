import { createError } from 'h3'
import type { SmsProvider } from '#shared/sms.ts'
import { registerSmsProvider } from '../registry'

const KAVENEGAR_BASE = 'https://api.kavenegar.com/v1'

type KavenegarResponse = {
  return?: { status?: number; message?: string }
  entries?: Array<{ messageid?: number | string }>
}

/** Extract a standalone 6-digit OTP from an SMS body when present. */
export function extractOtpToken(body: string): string | undefined {
  const match = body.match(/(?<!\d)(\d{6})(?!\d)/)
  return match?.[1]
}

function getApiKey(): string | undefined {
  const key = process.env.KAVENEGAR_API_KEY?.trim()
  return key || undefined
}

function mapKavenegarFailure(message: string | undefined, httpFallback: string) {
  const raw = message || httpFallback || 'unknown error'
  // Surface the most common Iran launch misconfig clearly.
  if (/ارسال کننده نامعتبر|sender/i.test(raw)) {
    return 'Kavenegar SMS failed: invalid sender — set a panel-approved KAVENEGAR_SENDER, or use KAVENEGAR_TEMPLATE for OTP Verify Lookup'
  }
  return `Kavenegar SMS failed: ${raw}`
}

async function kavenegarRequest(path: string, params: Record<string, string>) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Kavenegar not configured' })
  }

  const url = new URL(`${KAVENEGAR_BASE}/${apiKey}/${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  let res: Response
  try {
    res = await fetch(url.toString(), { method: 'GET' })
  } catch (err) {
    console.error('[sms:kavenegar] network error', err instanceof Error ? err.message : 'unknown')
    throw createError({ statusCode: 502, statusMessage: 'Kavenegar SMS unreachable' })
  }
  const data = (await res.json().catch(() => null)) as KavenegarResponse | null
  const status = data?.return?.status

  if (!res.ok || status !== 200) {
    console.error('[sms:kavenegar] failed', { httpStatus: res.status, apiStatus: status, message: data?.return?.message })
    throw createError({
      statusCode: 502,
      statusMessage: mapKavenegarFailure(data?.return?.message, res.statusText),
    })
  }

  const messageId = data?.entries?.[0]?.messageid
  return {
    providerRef: messageId != null ? `kavenegar-${messageId}` : `kavenegar-${Date.now()}`,
  }
}

/**
 * Send via Kavenegar.
 * Verify Lookup is OTP-only (requires purpose=otp + KAVENEGAR_TEMPLATE + 6-digit token).
 * Never route CRM/notify bodies through verify/lookup just because they contain digits.
 */
async function sendViaKavenegar(to: string, body: string, purpose?: string) {
  const template = process.env.KAVENEGAR_TEMPLATE?.trim()
  const token = extractOtpToken(body)

  if (purpose === 'otp' && template && token) {
    return kavenegarRequest('verify/lookup.json', {
      receptor: to,
      token,
      template,
    })
  }

  const params: Record<string, string> = {
    receptor: to,
    message: body,
  }
  const sender = process.env.KAVENEGAR_SENDER?.trim()
  if (sender) params.sender = sender

  return kavenegarRequest('sms/send.json', params)
}

export function kavenegarSmsProvider(): SmsProvider {
  const provider: SmsProvider = {
    name: 'live',
    async send(opts) {
      const result = await sendViaKavenegar(opts.to, opts.body, opts.purpose)
      if (opts.clubId) {
        await prisma.smsLog.create({
          data: {
            clubId: opts.clubId,
            message: opts.body,
            recipient: opts.to,
          },
        })
      }
      return { sent: true, logged: Boolean(opts.clubId), providerRef: result.providerRef }
    },
    async sendBulk(opts) {
      // CRM/campaign traffic always uses sms/send — never Verify Lookup.
      const receptors = opts.recipients.map((r) => r.phone).join(',')
      const params: Record<string, string> = {
        receptor: receptors,
        message: opts.body,
      }
      const sender = process.env.KAVENEGAR_SENDER?.trim()
      if (sender) params.sender = sender

      const result = await kavenegarRequest('sms/send.json', params)
      if (opts.clubId) {
        await prisma.smsLog.create({
          data: {
            clubId: opts.clubId,
            message: opts.body,
            recipient: `${opts.recipients.length} contacts`,
            segmentName: opts.segmentName,
            campaignName: opts.campaignName,
          },
        })
      }
      return { sent: true, logged: Boolean(opts.clubId), providerRef: result.providerRef }
    },
  }
  registerSmsProvider(provider)
  return provider
}
