import { normalizeIranPhone } from '#shared/phone.ts'
import { resolveSmsProvider } from '#shared/sms.ts'
import type { NotifyTemplate } from './notify'
import { sendNotification } from './notify'
import { renderSmsTemplate } from './sms/templates'

function parseAlertPhoneList(raw: string): string[] {
  const out: string[] = []
  for (const part of raw.split(/[,;]/)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    try {
      out.push(normalizeIranPhone(trimmed))
    }
    catch {
      // skip invalid entries
    }
  }
  return out
}

export type AdminSmsTemplate =
  | 'ADMIN_BOOKING_CONFIRMED'
  | 'ADMIN_BOOKING_PAID'
  | 'ADMIN_BOOKING_CANCELLED'
  | 'ADMIN_WITHDRAW_REQUEST'
  | 'ADMIN_CLUB_APPLICATION'
  | 'ADMIN_COACH_APPLICATION'
  | 'ADMIN_WALLET_TOPUP'

/**
 * Platform admin alert mobile.
 * Default: 09124777927 (same as public contact).
 * Override: ADMIN_ALERT_PHONE. Disable: ADMIN_ALERT_SMS=false or empty ADMIN_ALERT_PHONE.
 */
export function adminAlertPhone(): string | null {
  if (process.env.ADMIN_ALERT_SMS === 'false') return null
  const raw = (
    process.env.ADMIN_ALERT_PHONE
    ?? process.env.NUXT_PUBLIC_CONTACT_MOBILE
    ?? '09124777927'
  ).trim()
  if (!raw) return null
  return normalizeIranPhone(raw)
}

/**
 * Finance / family ops (فامیل) — manual SHEBA payouts for coach, athlete, and club withdraws.
 * `WITHDRAW_FINANCE_ALERT_PHONE` (comma-separated). Falls back to `ADMIN_ALERT_PHONE` when unset.
 */
export function withdrawFinanceAlertPhones(): string[] {
  if (process.env.ADMIN_ALERT_SMS === 'false') return []
  const dedicated = (
    process.env.WITHDRAW_FINANCE_ALERT_PHONE
    ?? process.env.FINANCE_ALERT_PHONE
    ?? ''
  ).trim()
  if (dedicated) return parseAlertPhoneList(dedicated)
  const fallback = adminAlertPhone()
  return fallback ? [fallback] : []
}

/** Soft-fail SMS to platform admin — never breaks product flows. */
export async function notifyAdminSms(
  template: AdminSmsTemplate,
  data: Record<string, unknown>,
  clubId?: string,
) {
  const phone = adminAlertPhone()
  if (!phone) return
  const mode = resolveSmsProvider()
  const body = renderSmsTemplate(template as NotifyTemplate, data)
  console.log('[adminNotify:sms]', mode, template, phone, body)
  try {
    await sendNotification({
      channel: 'sms',
      to: phone,
      template: template as NotifyTemplate,
      data,
      clubId,
    })
  } catch (err) {
    console.error('[adminNotify:sms]', template, err)
  }
}

export async function notifyAdminClubApplication(opts: {
  clubName: string
  city?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  sportSlug?: string | null
  clubId?: string | null
}) {
  await notifyAdminSms(
    'ADMIN_CLUB_APPLICATION',
    {
      clubName: opts.clubName,
      city: opts.city || '',
      contactName: opts.contactName || '',
      contactPhone: opts.contactPhone || '',
      contactEmail: opts.contactEmail || '',
      sportSlug: opts.sportSlug || '',
    },
    opts.clubId || undefined,
  )
}

export async function notifyAdminCoachApplication(opts: {
  coachName: string
  city?: string | null
  phone?: string | null
  email?: string | null
}) {
  await notifyAdminSms('ADMIN_COACH_APPLICATION', {
    coachName: opts.coachName,
    city: opts.city || '',
    phone: opts.phone || '',
    email: opts.email || '',
  })
}

export async function notifyAdminWithdrawRequest(opts: {
  kind: 'club' | 'athlete' | 'coach'
  amount: number
  sheba?: string | null
  clubName?: string | null
  clubId?: string | null
  userName?: string | null
  userPhone?: string | null
  requestId?: string | null
}) {
  const phones = withdrawFinanceAlertPhones()
  if (!phones.length) return
  const mode = resolveSmsProvider()
  const data = {
    kind: opts.kind,
    amount: opts.amount,
    sheba: opts.sheba || '',
    clubName: opts.clubName || '',
    userName: opts.userName || '',
    userPhone: opts.userPhone || '',
    requestId: opts.requestId || '',
  }
  const body = renderSmsTemplate('ADMIN_WITHDRAW_REQUEST', data)
  for (const phone of phones) {
    console.log('[adminNotify:withdraw]', mode, opts.kind, phone, body)
    try {
      await sendNotification({
        channel: 'sms',
        to: phone,
        template: 'ADMIN_WITHDRAW_REQUEST',
        data,
        clubId: opts.clubId || undefined,
      })
    }
    catch (err) {
      console.error('[adminNotify:withdraw]', opts.requestId, phone, err)
    }
  }
}

export async function notifyAdminWalletTopUp(opts: {
  amount: number
  userName?: string | null
  userPhone?: string | null
  paymentId?: string | null
}) {
  await notifyAdminSms('ADMIN_WALLET_TOPUP', {
    amount: opts.amount,
    userName: opts.userName || '',
    userPhone: opts.userPhone || '',
    paymentId: opts.paymentId || '',
  })
}
