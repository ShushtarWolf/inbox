import { inAppNotificationHref } from '#shared/inAppNotificationHref.ts'

function parseMetadataJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  }
  catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  })
  const notifications = rows.map((row) => {
    const metadata = parseMetadataJson(row.metadataJson)
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      readAt: row.readAt,
      createdAt: row.createdAt,
      href: inAppNotificationHref(row.type, metadata),
    }
  })
  return { notifications, unreadCount }
})
