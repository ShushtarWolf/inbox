import { createError } from 'h3'
import type { SmsProvider } from '#shared/sms.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import { registerSmsProvider } from '../registry'

const KAVENEGAR_BASE = 'https://api.kavenegar.com/v1'

/** Default Verify Lookup template for booking/CRM free-text (panel: body = `%token10%`). */
export const DEFAULT_NOTIFY_LOOKUP_TEMPLATE = 'inbox-notify'

/** Kavenegar token10 practical limit (UTF-8 Persian). */
const TOKEN10_MAX = 100

type KavenegarResponse = {
  return?: { status?: number; message?: string }
  entries?: Array<{ messageid?: number | string }>
}

/** Extract a standalone 6-digit OTP from an SMS body when present. */
export function extractOtpToken(body: string): string | undefined {
  const match = body.match(/(?<!\d)(\d{6})(?!\d)/)
  return match?.[1]
}

/** Panel template for transactional/CRM lookup — override with KAVENEGAR_TEMPLATE_NOTIFY. */
export function resolveNotifyLookupTemplate(): string {
  return process.env.KAVENEGAR_TEMPLATE_NOTIFY?.trim() || DEFAULT_NOTIFY_LOOKUP_TEMPLATE
}

/**
 * Sanitize + truncate for Kavenegar Verify Lookup `token10`
 * (spaces OK; avoid # * ; collapse newlines).
 */
export function toKavenegarToken10(body: string): string {
  const cleaned = body
    .replace(/[\r\n]+/g, ' | ')
    .replace(/[#*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= TOKEN10_MAX) return cleaned
  return `${cleaned.slice(0, TOKEN10_MAX - 1).trim()}…`
}

function getApiKey(): string | undefined {
  const key = process.env.KAVENEGAR_API_KEY?.trim()
  return key || undefined
}

function mapKavenegarFailure(message: string | undefined, httpFallback: string) {
  const raw = message || httpFallback || 'unknown error'
  // Surface the most common Iran launch misconfig clearly.
  if (/ارسال کننده نامعتبر|sender/i.test(raw)) {
    return 'Kavenegar SMS failed: invalid sender — booking/CRM need Verify Lookup template (KAVENEGAR_TEMPLATE_NOTIFY / inbox-notify with %token10%); free-text sms/send needs an approved line'
  }
  // Template still in technical-test mode: only the Kavenegar account owner number works.
  if (/صاحب حساب|فقط امکان ارسال پیام تست|501/i.test(raw)) {
    return 'Kavenegar SMS failed: template restricted to account-owner phone — set inbox-verify usage to operational and wait for approval'
  }
  if (/قالب|template|431|یافت نشد|وجود ندارد/i.test(raw)) {
    return `Kavenegar SMS failed: notify template missing/invalid — create panel template "${resolveNotifyLookupTemplate()}" with body %token10% (or set KAVENEGAR_TEMPLATE_NOTIFY)`
  }
  return `Kavenegar SMS failed: ${raw}`
}

function normalizeReceptor(to: string): string {
  return normalizeIranPhone(to) || to.trim()
}

async function kavenegarRequest(path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'GET') {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Kavenegar not configured' })
  }

  const url = new URL(`${KAVENEGAR_BASE}/${apiKey}/${path}`)
  let res: Response
  try {
    if (method === 'POST') {
      const body = new URLSearchParams(params)
      res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
      })
    }
    else {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
      res = await fetch(url.toString(), { method: 'GET' })
    }
  }
  catch (err) {
    console.error('[sms:kavenegar] network error', err instanceof Error ? err.message : 'unknown')
    throw createError({ statusCode: 502, statusMessage: 'Kavenegar SMS unreachable' })
  }
  const data = (await res.json().catch(() => null)) as KavenegarResponse | null
  const status = data?.return?.status

  if (!res.ok || status !== 200) {
    console.error('[sms:kavenegar] failed', { httpStatus: res.status, apiStatus: status, message: data?.return?.message, path })
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
 * - OTP: Verify Lookup with KAVENEGAR_TEMPLATE + 6-digit token
 * - notify/campaign: Verify Lookup with inbox-notify (%token10%) — free-text sms/send fails on
 *   service lines that only allow lookup (prod sender 10004347 returns 412 on sms/send)
 * - fallback: POST sms/send when notify template explicitly disabled (KAVENEGAR_TEMPLATE_NOTIFY=)
 */
async function sendViaKavenegar(to: string, body: string, purpose?: string) {
  const receptor = normalizeReceptor(to)
  const otpTemplate = process.env.KAVENEGAR_TEMPLATE?.trim()
  const token = extractOtpToken(body)

  if (purpose === 'otp' && otpTemplate && token) {
    return kavenegarRequest('verify/lookup.json', {
      receptor,
      token,
      template: otpTemplate,
    })
  }

  const notifyDisabled = process.env.KAVENEGAR_TEMPLATE_NOTIFY?.trim() === ''
  const useNotifyLookup = (purpose === 'notify' || purpose === 'campaign') && !notifyDisabled
  if (useNotifyLookup) {
    return kavenegarRequest('verify/lookup.json', {
      receptor,
      token10: toKavenegarToken10(body),
      template: resolveNotifyLookupTemplate(),
    })
  }

  // OTP without template, or notify explicitly forced to free-text.
  const params: Record<string, string> = {
    receptor,
    message: body,
  }
  const sender = process.env.KAVENEGAR_SENDER?.trim()
  if (sender) params.sender = sender

  return kavenegarRequest('sms/send.json', params, 'POST')
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
            recipient: normalizeReceptor(opts.to),
            campaignName: opts.template || undefined,
          },
        })
      }
      return { sent: true, logged: Boolean(opts.clubId), providerRef: result.providerRef }
    },
    async sendBulk(opts) {
      // Prefer same lookup path as single notify (service lines often reject sms/send).
      const notifyDisabled = process.env.KAVENEGAR_TEMPLATE_NOTIFY?.trim() === ''
      if (!notifyDisabled) {
        const template = resolveNotifyLookupTemplate()
        const token10 = toKavenegarToken10(opts.body)
        let lastRef = `kavenegar-bulk-${Date.now()}`
        for (const recipient of opts.recipients) {
          const result = await kavenegarRequest('verify/lookup.json', {
            receptor: normalizeReceptor(recipient.phone),
            token10,
            template,
          })
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

      const receptors = opts.recipients.map((r) => normalizeReceptor(r.phone)).join(',')
      const params: Record<string, string> = {
        receptor: receptors,
        message: opts.body,
      }
      const sender = process.env.KAVENEGAR_SENDER?.trim()
      if (sender) params.sender = sender

      const result = await kavenegarRequest('sms/send.json', params, 'POST')
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
