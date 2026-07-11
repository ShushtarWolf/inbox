import nodemailer from 'nodemailer'

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

let transporter: nodemailer.Transporter | null | undefined

function getTransporter() {
  if (transporter !== undefined) return transporter

  const host = process.env.SMTP_HOST
  if (!host) {
    transporter = null
    return transporter
  }

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

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_ENABLED === 'true')
}

export async function sendEmail(opts: SendEmailInput) {
  const transport = getTransporter()
  if (!transport) {
    console.warn('[email] SMTP not configured — skipping send to', opts.to)
    return { sent: false, reason: 'no_smtp' as const }
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
    return { sent: true as const }
  } catch (err) {
    console.error('[email] send failed', opts.to, err)
    return { sent: false, reason: 'send_error' as const }
  }
}
