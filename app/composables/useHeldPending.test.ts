import { effectScope, ref, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_LOADING_VISIBLE_MS, useHeldPending } from './useHeldPending.ts'

describe('useHeldPending', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds true for minMs after source flips false', async () => {
    const scope = effectScope()
    const source = ref(false)
    const held = scope.run(() => useHeldPending(source, { minMs: 550 }))!

    expect(held.value).toBe(false)

    source.value = true
    await nextTick()
    expect(held.value).toBe(true)

    source.value = false
    await nextTick()
    expect(held.value).toBe(true)

    vi.advanceTimersByTime(549)
    expect(held.value).toBe(true)

    vi.advanceTimersByTime(1)
    expect(held.value).toBe(false)

    scope.stop()
  })

  it('releases immediately when forceRelease becomes true', async () => {
    const scope = effectScope()
    const source = ref(true)
    const forceRelease = ref(false)
    const held = scope.run(() => useHeldPending(source, { minMs: 550, forceRelease }))!

    expect(held.value).toBe(true)

    source.value = false
    await nextTick()
    expect(held.value).toBe(true)

    forceRelease.value = true
    await nextTick()
    expect(held.value).toBe(false)

    scope.stop()
  })

  it('uses the shared default min duration', () => {
    expect(MIN_LOADING_VISIBLE_MS).toBe(550)
  })
})
