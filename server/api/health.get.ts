export default defineEventHandler(async (event) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, service: 'inbox', db: 'up' }
  } catch (err) {
    console.error('[health] database unreachable', err instanceof Error ? err.message : err)
    throw createError({
      statusCode: 503,
      statusMessage: 'Database unavailable',
      data: { ok: false, service: 'inbox', db: 'down' },
    })
  }
})
