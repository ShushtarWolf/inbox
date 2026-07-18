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
      statusMessage: `Kavenegar SMS failed: ${data?.return?.message || res.statusText || 'unknown error'}`,
    })
  }

  const messageId = data?.entries?.[0]?.messageid
  return {
    providerRef: messageId != null ? `kavenegar-${messageId}` : `kavenegar-${Date.now()}`,
  }
}

async function sendViaKavenegar(to: string, body: string) {
  const template = process.env.KAVENEGAR_TEMPLATE?.trim()
  const token = extractOtpToken(body)

  // Prefer Verify Lookup for OTP when a panel-approved template is configured.
  if (template && token) {
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
      const result = await sendViaKavenegar(opts.to, opts.body)
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
      const template = process.env.KAVENEGAR_TEMPLATE?.trim()
      const token = extractOtpToken(opts.body)

      if (template && token) {
        let lastRef = `kavenegar-bulk-${Date.now()}`
        for (const recipient of opts.recipients) {
          const result = await sendViaKavenegar(recipient.phone, opts.body)
          lastRef = result.providerRef
        }
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
        return { sent: true, logged: Boolean(opts.clubId), providerRef: lastRef }
      }

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
