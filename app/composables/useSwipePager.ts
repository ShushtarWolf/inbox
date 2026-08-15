/**
 * Horizontal swipe/drag between slides. Vertical page scroll stays (pan-y).
 * Screen-space: swipe left → next, swipe right → previous (same as gallery arrows).
 */
export function useSwipePager(index: Ref<number>, count: MaybeRefOrGetter<number>) {
  let startX = 0
  let active = false

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button, a, input, select, textarea')) return
    active = true
    startX = e.clientX
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!active) return
    active = false
    const n = toValue(count)
    const dx = e.clientX - startX
    if (n < 2 || Math.abs(dx) < 40) return
    if (dx < 0) index.value = (index.value + 1) % n
    else index.value = (index.value - 1 + n) % n
  }

  return { onPointerDown, onPointerUp }
}
