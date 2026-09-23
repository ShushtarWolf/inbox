import {
  getCurrentScope,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

/** Keep fold spinner / route overlay readable (cube cycle is 1.8s). */
export const MIN_LOADING_VISIBLE_MS = 550

export type UseHeldPendingOptions = {
  minMs?: number
  /** When true, drop the hold immediately (errors, cancelled nav). */
  forceRelease?: MaybeRefOrGetter<boolean>
}

/**
 * Mirrors a pending flag but keeps `true` for at least `minMs` after it
 * becomes true, so fast fetches / route changes still show the spinner.
 */
export function useHeldPending(
  source: MaybeRefOrGetter<boolean>,
  options: UseHeldPendingOptions = {},
): Ref<boolean> {
  const minMs = options.minMs ?? MIN_LOADING_VISIBLE_MS
  const held = ref(false)
  let shownAt = 0
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function release() {
    clearHideTimer()
    held.value = false
  }

  watch(
    () => toValue(source),
    (pending) => {
      clearHideTimer()
      if (pending) {
        if (!held.value) shownAt = Date.now()
        held.value = true
        return
      }
      if (options.forceRelease && toValue(options.forceRelease)) {
        release()
        return
      }
      const elapsed = shownAt ? Date.now() - shownAt : minMs
      const remaining = minMs - elapsed
      if (remaining <= 0) {
        release()
        return
      }
      hideTimer = setTimeout(() => {
        hideTimer = null
        held.value = false
      }, remaining)
    },
    { immediate: true },
  )

  if (options.forceRelease) {
    watch(
      () => toValue(options.forceRelease!),
      (force) => {
        if (force) release()
      },
    )
  }

  if (getCurrentScope()) {
    onScopeDispose(clearHideTimer)
  }

  return held
}
