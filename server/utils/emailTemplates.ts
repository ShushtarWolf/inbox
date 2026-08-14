import type { NotifyTemplate } from './notify'

type TemplateData = Record<string, unknown>

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderEmailTemplate(template: NotifyTemplate, data: TemplateData) {
  switch (template) {
    case 'PASSWORD_RESET': {
      const resetUrl = String(data.resetUrl || '')
      return {
        subject: 'Reset your inbox password',
        text: `Reset your password using this link (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
        html: `<p>Reset your password using this link (valid for 1 hour):</p><p><a href="${esc(resetUrl)}">${esc(resetUrl)}</a></p><p>If you did not request this, ignore this email.</p>`,
      }
    }
    case 'BOOKING_CONFIRMED': {
      const clubName = String(data.clubName || 'Club')
      const date = String(data.date || '')
      const time = String(data.startTime || '')
      const endTime = String(data.endTime || '').trim()
      const timeLabel = endTime && endTime !== time ? `${time}–${endTime}` : time
      const kind = String(data.kind || 'court')
      const courtName = String(data.courtName || '').trim()
      const address = String(data.address || '').trim()
      const mapsUrl = String(data.mapsUrl || '').trim()
      const paid = data.paymentPaid === true
        ? 'Paid'
        : data.paymentPaid === false
          ? 'Unpaid — pay at club on arrival'
          : 'pay at club on arrival'
      const label = kind === 'coach' ? 'Coach session' : kind === 'package' ? 'Package booking' : 'Court booking'
      const extras = [
        courtName ? `Court: ${courtName}` : '',
        `Payment: ${paid}`,
        address ? `Address: ${address}` : '',
        mapsUrl,
      ].filter(Boolean).join('\n')
      return {
        subject: `Booking confirmed — ${clubName}`,
        text: `${label} confirmed at ${clubName}\nDate: ${date}\nTime: ${timeLabel}\n${extras}`,
        html: `<p><strong>${esc(label)} confirmed</strong> at ${esc(clubName)}</p><p>Date: ${esc(date)}<br>Time: ${esc(timeLabel)}${courtName ? `<br>Court: ${esc(courtName)}` : ''}</p><p>Payment: ${esc(paid)}</p>${address ? `<p>${esc(address)}</p>` : ''}${mapsUrl ? `<p><a href="${esc(mapsUrl)}">${esc(mapsUrl)}</a></p>` : ''}`,
      }
    }
    case 'BOOKING_CANCELLED': {
      const clubName = String(data.clubName || 'Club')
      const date = String(data.date || '')
      const time = String(data.startTime || '')
      const kind = String(data.kind || 'court')
      const label = kind === 'coach' ? 'Coach session' : kind === 'package' ? 'Package booking' : 'Court booking'
      return {
        subject: `Booking cancelled — ${clubName}`,
        text: `${label} at ${clubName} was cancelled.\nDate: ${date}\nTime: ${time}`,
        html: `<p><strong>${esc(label)} cancelled</strong> at ${esc(clubName)}</p><p>Date: ${esc(date)}<br>Time: ${esc(time)}</p>`,
      }
    }
    case 'BOOKING_PAID': {
      const clubName = String(data.clubName || 'Club')
      const date = String(data.date || '')
      const time = String(data.startTime || '')
      const kind = String(data.kind || 'court')
      const label = kind === 'coach' ? 'Coach session' : kind === 'package' ? 'Package booking' : 'Court booking'
      return {
        subject: `Payment received — ${clubName}`,
        text: `${label} at ${clubName} has been marked paid.\nDate: ${date}\nTime: ${time}`,
        html: `<p><strong>Payment received</strong> for ${esc(label)} at ${esc(clubName)}</p><p>Date: ${esc(date)}<br>Time: ${esc(time)}</p>`,
      }
    }
    case 'WAITLIST_SLOT_AVAILABLE': {
      const date = String(data.date || '')
      const startTime = String(data.startTime || '')
      return {
        subject: 'A slot is now available',
        text: `A slot opened on ${date} at ${startTime}. Log in to book before it is taken.`,
        html: `<p>A slot opened on <strong>${esc(date)}</strong> at <strong>${esc(startTime)}</strong>.</p><p>Log in to book before it is taken.</p>`,
      }
    }
    case 'CLUB_APPROVED': {
      const loginUrl = String(data.loginUrl || '')
      const tempPassword = data.tempPassword ? String(data.tempPassword) : ''
      const clubName = String(data.clubName || 'your club')
      const passwordLine = tempPassword
        ? `\nTemporary password: ${tempPassword}\nPlease change it after your first login.`
        : '\nUse your existing password to log in.'
      return {
        subject: `Your club "${clubName}" is approved`,
        text: `Your club application for ${clubName} has been approved.\n\nLogin: ${loginUrl}${passwordLine}`,
        html: `<p>Your club application for <strong>${esc(clubName)}</strong> has been approved.</p><p><a href="${esc(loginUrl)}">Log in to your owner dashboard</a></p>${tempPassword ? `<p>Temporary password: <code>${esc(tempPassword)}</code><br>Please change it after your first login.</p>` : '<p>Use your existing password to log in.</p>'}`,
      }
    }
    default:
      return {
        subject: 'inbox notification',
        text: JSON.stringify(data),
        html: `<pre>${esc(JSON.stringify(data, null, 2))}</pre>`,
      }
  }
}
