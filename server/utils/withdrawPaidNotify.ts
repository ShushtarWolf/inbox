import { normalizeIranPhone } from '#shared/phone.ts'
import { clubNotifyName, clubSideNotifyPhones } from './bookingNotify'
import { createInAppNotification, sendNotification } from './notify'
import { prisma } from './prisma'
import { renderSmsTemplate } from './sms/templates'

type PaidRequest = { id: string; amount: number; shebaSnapshot?: string | null }

/** Fail-soft: never throws — the PAID status is already committed. */
export async function notifyClubWithdrawPaid(request: PaidRequest & { clubId: string }) {
  try {
    const club = await prisma.club.findUnique({
      where: { id: request.clubId },
      select: { nameFa: true, nameEn: true, ownerId: true, owner: { select: { phone: true } } },
    })
    if (!club) return
    const data = { kind: 'club', clubName: clubNotifyName(club), amount: request.amount, sheba: request.shebaSnapshot || '' }
    if (club.ownerId) {
      await createInAppNotification({
        userId: club.ownerId,
        type: 'WITHDRAW_PAID',
        title: 'پرداخت به شباتون انجام شد',
        body: renderSmsTemplate('WITHDRAW_PAID', data),
        metadata: { withdrawRequestId: request.id, clubId: request.clubId, amount: request.amount },
      }).catch(err => console.error('[withdrawPaid:inApp]', request.id, err))
    }
    const phones = await clubSideNotifyPhones(club.owner?.phone, request.clubId)
    for (const to of phones) {
      await sendNotification({ channel: 'sms', to, template: 'WITHDRAW_PAID', data, clubId: request.clubId })
        .catch(err => console.error('[withdrawPaid:sms]', request.id, err))
    }
  } catch (err) {
    console.error('[withdrawPaid:club]', request.id, err)
  }
}

export async function notifyUserWithdrawPaid(request: PaidRequest & { userId: string }) {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.userId }, select: { phone: true } })
    const data = { kind: 'user', amount: request.amount, sheba: request.shebaSnapshot || '' }
    await createInAppNotification({
      userId: request.userId,
      type: 'WITHDRAW_PAID',
      title: 'پرداخت به شباتون انجام شد',
      body: renderSmsTemplate('WITHDRAW_PAID', data),
      metadata: { withdrawRequestId: request.id, amount: request.amount },
    }).catch(err => console.error('[withdrawPaid:inApp]', request.id, err))
    const to = normalizeIranPhone(user?.phone)
    if (to) {
      await sendNotification({ channel: 'sms', to, template: 'WITHDRAW_PAID', data })
        .catch(err => console.error('[withdrawPaid:sms]', request.id, err))
    }
  } catch (err) {
    console.error('[withdrawPaid:user]', request.id, err)
  }
}
