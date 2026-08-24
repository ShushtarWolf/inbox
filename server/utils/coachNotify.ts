import { siteUrl } from './email'
import { sendNotification } from './notify'

/** Coach-facing result of a platform admin review — always fail-soft, never undoes the review. */
export async function notifyCoachApplicationReviewed(opts: {
  approved: boolean
  coachName: string
  note?: string | null
  email?: string | null
  phone?: string | null
}) {
  const template = opts.approved ? 'COACH_APPROVED' : 'COACH_REJECTED'
  const data = {
    coachName: opts.coachName,
    note: opts.note || '',
    loginUrl: `${siteUrl()}/login`,
  }

  if (opts.email) {
    try {
      await sendNotification({ channel: 'email', to: opts.email, template, data })
    } catch (err) {
      console.error('[coachNotify:email]', template, err)
    }
  }

  if (opts.phone) {
    try {
      await sendNotification({ channel: 'sms', to: opts.phone, template, data })
    } catch (err) {
      console.error('[coachNotify:sms]', template, err)
    }
  }
}
