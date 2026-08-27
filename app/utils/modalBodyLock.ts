/**
 * Nested AppModal instances share one body scroll lock.
 * Clearing overflow when an inner sheet closes must not unlock while an outer modal is still open
 * (Safari can leave the page in a broken hit-test / scroll state after upload crop + failure sheets).
 */
let lockCount = 0

export function acquireModalBodyLock() {
  if (!import.meta.client) return
  lockCount += 1
  document.body.style.overflow = 'hidden'
}

export function releaseModalBodyLock() {
  if (!import.meta.client) return
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = ''
  }
}
