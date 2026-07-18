import nodemailer from 'nodemailer'

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

export type EmailMode = 'log' | 'live'

export type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: 'disabled' | 'no_smtp' | 'send_error' }

let transporter: nodemailer.Transporter | null | undefined

/** True when EMAIL_ENABLED=true (intent to send live mail). */
export function isEmailEnabled() {
  return process.env.EMAIL_ENABLED === 'true'
}

/**
 * Live-ready: EMAIL_ENABLED=true and SMTP_HOST set.
 * Never inspects or returns SMTP_PASS.
 */
export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim() && isEmailEnabled())
}

/** Resolved delivery mode — log by default; live only when fully configured. */
export function getEmailMode(): EmailMode {
  return isEmailConfigured() ? 'live' : 'log'
}

/** Safe ops snapshot — never includes SMTP_PASS or message bodies. */
export function getEmailStatus() {
  const emailEnabledFlag = isEmailEnabled()
  const hasSmtpHost = Boolean(process.env.SMTP_HOST?.trim())
  const hasSmtpUser = Boolean(process.env.SMTP_USER?.trim())
  const hasSmtpFrom = Boolean(process.env.SMTP_FROM?.trim())
  const emailConfigured = isEmailConfigured()
  const emailMode = getEmailMode()
  const warnings: string[] = []
  if (emailEnabledFlag && !hasSmtpHost) {
    warnings.push('EMAIL_ENABLED is true but SMTP_HOST is missing — staying in log mode')
  }
  return {
    emailMode,
    emailConfigured,
    emailEnabledFlag,
    hasSmtpHost,
    hasSmtpUser,
    hasSmtpFrom,
    smtpPort: process.env.SMTP_PORT || '587',
    warnings,
    note:
      emailMode === 'live'
        ? 'Live SMTP — password reset and booking emails will send'
        : 'Safe log mode — emails are logged only; SMTP not required',
  }
}

function getTransporter() {
  if (transporter !== undefined) return transporter

  if (!isEmailConfigured()) {
    transporter = null
    return transporter
  }

  const host = process.env.SMTP_HOST!.trim()
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  })

  return transporter
}

export function siteUrl() {
  return process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

/**
 * Send email when live-configured; otherwise log and return.
 * Never throws — SMTP/network failures are soft-fail.
 */
export async function sendEmail(opts: SendEmailInput): Promise<SendEmailResult> {
  if (!isEmailEnabled()) {
    console.log('[email:log]', opts.to, opts.subject)
    return { sent: false, reason: 'disabled' }
  }

  const transport = getTransporter()
  if (!transport) {
    console.warn('[email] SMTP not configured — skipping send to', opts.to)
    return { sent: false, reason: 'no_smtp' }
  }

  const from = process.env.SMTP_FROM || 'inbox <noreply@localhost>'

  try {
    await transport.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    })
    return { sent: true }
  } catch (err) {
    console.error('[email] send failed', opts.to, err)
    return { sent: false, reason: 'send_error' }
  }
}
