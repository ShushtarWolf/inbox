import { randomBytes } from 'node:crypto'
import { hashSecret } from '../../../../utils/password'
import { siteUrl } from '../../../../utils/email'
import { sendNotification } from '../../../../utils/notify'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ ownerEmail?: string }>(event)
  const ownerEmail = body.ownerEmail?.trim().toLowerCase()
  if (!id || !ownerEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const application = await prisma.clubApplication.findUnique({ where: { id } })
  if (!application || application.status !== 'PENDING') {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  }

  const sport = await prisma.sport.findFirstOrThrow({
    where: { slug: application.sportSlug },
  })

  let user = await prisma.user.findUnique({ where: { email: ownerEmail } })
  const tempPassword = randomBytes(12).toString('base64url')
  const isNewUser = !user

  const result = await prisma.$transaction(async (tx) => {
    if (!user) {
      user = await tx.user.create({
        data: {
          email: ownerEmail,
          name: application.contactName,
          nameEn: application.contactName,
          role: 'CLUB_ADMIN',
          passwordHash: hashSecret(tempPassword),
          phone: application.contactPhone,
        },
      })
    } else if (user.role !== 'CLUB_ADMIN') {
      throw createError({ statusCode: 409, statusMessage: 'User exists with different role' })
    }

    const slug = `club-${application.id.slice(-8)}`
    const club = await tx.club.create({
      data: {
        slug,
        nameFa: application.clubName,
        nameEn: application.clubName,
        addressFa: application.city,
        addressEn: application.city,
        city: application.city,
        ownerId: user!.id,
        status: 'ACTIVE',
        openHour: 8,
        closeHour: 22,
        priceFrom: 600000,
      },
    })

    await tx.court.create({
      data: {
        nameFa: 'زمین ۱',
        nameEn: 'Court 1',
        clubId: club.id,
        sportId: sport.id,
        price: 600000,
      },
    })

    await tx.staffMembership.create({
      data: {
        userId: user!.id,
        clubId: club.id,
        role: 'OWNER',
        permissionsJson: JSON.stringify(['calendar', 'finance', 'crm', 'team', 'settings']),
        active: true,
        isPrimary: true,
      },
    })

    await tx.clubApplication.update({
      where: { id: application.id },
      data: { status: 'APPROVED', clubId: club.id },
    })

    return { club, user: user! }
  })

  // Fail soft — SMTP errors must not undo approval.
  try {
    await sendNotification({
      channel: 'email',
      to: result.user.email,
      template: 'CLUB_APPROVED',
      data: {
        clubName: application.clubName,
        loginUrl: `${siteUrl()}/login`,
        tempPassword: isNewUser ? tempPassword : undefined,
      },
    })
  } catch (err) {
    console.error('[admin:club-approve:email]', err)
  }

  return {
    clubId: result.club.id,
    clubSlug: result.club.slug,
    ownerEmail: result.user.email,
    temporaryPassword: isNewUser ? tempPassword : undefined,
  }
})
