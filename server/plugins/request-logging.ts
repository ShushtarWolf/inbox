export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const path = event.path || ''
    if (!path.startsWith('/api/bookings') && !path.startsWith('/api/payments')) return
    const user = event.context.user
    console.log(JSON.stringify({
      type: 'booking_event',
      path,
      method: event.method,
      userId: user?.id || null,
      clubId: getQuery(event).clubId || null,
    }))
  })
})
