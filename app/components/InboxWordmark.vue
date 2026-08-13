<script setup lang="ts">
/**
 * inboxs logotype with Anime.js SplitText clone (chars slide through a clip).
 * Keep dir=ltr so RTL pages do not reverse the Latin brand (INBOX → xobni).
 * Use for the wordmark only — keep the logo mark SVG separate.
 */
withDefaults(
  defineProps<{
    text?: string
  }>(),
  {
    text: 'inboxs',
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
    dir="ltr"
    class="inbox-wordmark inline-block font-display font-bold tracking-wide"
    aria-label="inboxs"
  >{{ text }}</span>
</template>
