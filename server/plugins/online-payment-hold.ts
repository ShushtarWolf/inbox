import { releaseExpiredOnlinePaymentHolds } from '../utils/onlinePaymentHold'

const RELEASE_INTERVAL_MS = 60_000

/**
 * Background sweep for abandoned online payment soft-holds.
 * Lazy release on calendar/availability/book remains the primary path;
 * this keeps slots free even when nobody is reading them.
 */
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return

  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await releaseExpiredOnlinePaymentHolds()
    }
    catch (err) {
      console.error('[onlinePaymentHold:sweep]', err)
    }
    finally {
      running = false
    }
  }

  const timer = setInterval(() => {
    void tick()
  }, RELEASE_INTERVAL_MS)
  timer.unref?.()

  // First pass shortly after boot.
  setTimeout(() => {
    void tick()
  }, 5_000).unref?.()
})
