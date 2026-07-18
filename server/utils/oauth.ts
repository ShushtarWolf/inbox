import type { H3Event } from 'h3'
import { toSessionUser, touchLastLogin } from './auth'

type GoogleProfile = {
  sub: string
  email?: string
  name?: string
  picture?: string
}

export async function upsertGoogleUser(profile: GoogleProfile, locale?: string) {
  const email = profile.email?.trim().toLowerCase()
  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'Google account has no email' })
  }

  const byOAuth = await prisma.user.findFirst({
    where: { oauthProvider: 'google', oauthSubject: profile.sub },
  })
  if (byOAuth) return byOAuth

  const byEmail = await prisma.user.findUnique({ where: { email } })
  if (byEmail) {
    if (byEmail.oauthProvider && byEmail.oauthProvider !== 'google') {
      throw createError({ statusCode: 409, statusMessage: 'Email linked to another sign-in method' })
    }
    return prisma.user.update({
      where: { id: byEmail.id },
      data: {
        oauthProvider: 'google',
        oauthSubject: profile.sub,
        avatarUrl: byEmail.avatarUrl || profile.picture || null,
      },
    })
  }

  return prisma.user.create({
    data: {
      email,
      name: profile.name?.trim() || email.split('@')[0] || 'Athlete',
      role: 'ATHLETE',
      locale: locale === 'en' ? 'en' : 'fa',
      oauthProvider: 'google',
      oauthSubject: profile.sub,
      avatarUrl: profile.picture || null,
    },
  })
}

export async function signInOAuthUser(event: H3Event, user: { id: string; email: string; name: string; nameEn?: string | null; role: string; locale: string }) {
  await setUserSession(event, { user: toSessionUser(user) })
  await touchLastLogin(user.id)
}
