import { normalizeIranPhone } from '#shared/phone.ts'
import { resolveSmsProvider } from '#shared/sms.ts'
import type { NotifyTemplate } from './notify'
import { sendNotification } from './notify'
import { renderSmsTemplate } from './sms/templates'

export type AdminSmsTemplate =
  | 'ADMIN_BOOKING_CONFIRMED'
  | 'ADMIN_BOOKING_PAID'
  | 'ADMIN_BOOKING_CANCELLED'
  | 'ADMIN_WITHDRAW_REQUEST'
  | 'ADMIN_CLUB_APPLICATION'
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

export async function notifyAdminWithdrawRequest(opts: {
  kind: 'club' | 'athlete'
  amount: number
  sheba?: string | null
  clubName?: string | null
  clubId?: string | null
  userName?: string | null
  userPhone?: string | null
  requestId?: string | null
}) {
  await notifyAdminSms(
    'ADMIN_WITHDRAW_REQUEST',
    {
      kind: opts.kind,
      amount: opts.amount,
      sheba: opts.sheba || '',
      clubName: opts.clubName || '',
      userName: opts.userName || '',
      userPhone: opts.userPhone || '',
      requestId: opts.requestId || '',
    },
    opts.clubId || undefined,
  )
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
