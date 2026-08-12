<script setup lang="ts">
/**
 * INBOX logotype with Anime.js SplitText clone (chars slide through a clip).
 * Use for the wordmark only — keep the logo mark SVG separate.
 */
withDefaults(
  defineProps<{
    text?: string
  }>(),
  {
    text: 'INBOX',
  },
)

const root = ref<HTMLElement | null>(null)

type SplitterHandle = {
  revert: () => void
  addEffect: (effect: (split: { chars: HTMLElement[] }) => unknown) => unknown
}

let splitter: SplitterHandle | null = null

onMounted(async () => {
  if (!import.meta.client || !root.value) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const { createTimeline, stagger, splitText } = await import('animejs')

  splitter = splitText(root.value, {
    chars: {
      wrap: 'clip',
      clone: 'bottom',
    },
  }) as SplitterHandle

  splitter.addEffect(({ chars }) =>
    createTimeline().add(
      chars,
      {
        y: '-100%',
        loop: true,
        loopDelay: 350,
        duration: 750,
        ease: 'inOut(2)',
      },
      stagger(150, { from: 'center' }),
    ),
  )
})

onBeforeUnmount(() => {
  splitter?.revert()
  splitter = null
})
</script>

<template>
  <span
    ref="root"
    class="inbox-wordmark inline-block font-display font-bold tracking-wide"
    aria-label="inbox"
  >{{ text }}</span>
</template>
