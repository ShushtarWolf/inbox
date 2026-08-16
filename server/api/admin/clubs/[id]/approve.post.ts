import { ALL_OWNER_PERMISSIONS } from '#shared/ownerPermissions.ts'
import { assignAddedRole, hasRole } from '#shared/roles.ts'
import { randomBytes } from 'node:crypto'
import { hashSecret } from '../../../../utils/password'
import { siteUrl } from '../../../../utils/email'
import { sendNotification } from '../../../../utils/notify'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ ownerEmail?: string }>(event)
  const ownerEmail = body.ownerEmail?.trim().toLowerCase()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const application = await prisma.clubApplication.findUnique({
    where: { id },
    include: {
      club: {
        include: {
          owner: { select: { id: true, email: true, name: true, phone: true, role: true, secondaryRole: true } },
        },
      },
    },
  })
  if (!application || application.status !== 'PENDING') {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  }

  // Self-serve signup already created user + PENDING club — just activate.
  if (application.clubId && application.club) {
    const club = application.club
    const owner = club.owner
    if (!owner || !hasRole(owner, 'CLUB_ADMIN')) {
      throw createError({ statusCode: 409, statusMessage: 'Club owner missing' })
    }

    await prisma.$transaction(async (tx) => {
      await tx.club.update({
        where: { id: club.id },
        data: {
          status: 'ACTIVE',
          verifiedAt: club.verifiedAt || new Date(),
        },
      })
      await tx.clubApplication.update({
        where: { id: application.id },
        data: { status: 'APPROVED' },
      })
    })

    try {
      await sendNotification({
        channel: 'email',
        to: owner.email,
        template: 'CLUB_APPROVED',
        data: {
          clubName: application.clubName,
          loginUrl: `${siteUrl()}/login`,
        },
      })
    } catch (err) {
      console.error('[admin:club-approve:email]', err)
    }

    if (owner.phone) {
      try {
        await sendNotification({
          channel: 'sms',
          to: owner.phone,
          template: 'CLUB_APPROVED',
          data: { clubName: application.clubName },
          clubId: club.id,
        })
      } catch (err) {
        console.error('[admin:club-approve:sms]', err)
      }
    }

    return {
      clubId: club.id,
      clubSlug: club.slug,
      ownerEmail: owner.email,
      alreadyProvisioned: true,
    }
  }

  if (!ownerEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
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
    } else if (!hasRole(user, 'CLUB_ADMIN')) {
      const assigned = assignAddedRole(user, 'CLUB_ADMIN')
      if (!assigned) {
        throw createError({ statusCode: 409, statusMessage: 'User already has two roles' })
      }
      user = await tx.user.update({
        where: { id: user.id },
        data: {
          role: assigned.role,
          secondaryRole: assigned.secondaryRole,
        },
      })
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
        verifiedAt: new Date(),
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
        permissionsJson: JSON.stringify(ALL_OWNER_PERMISSIONS),
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
    alreadyProvisioned: false,
  }
})
