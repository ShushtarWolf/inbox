<script setup lang="ts">
/**
 * inboxs logotype with Anime.js SplitText clone (chars slide through a clip).
 * Keep dir=ltr so RTL pages do not reverse the Latin brand (INBOX → xobni).
 * Use for the wordmark only — keep the logo mark SVG separate.
 */
const props = withDefaults(
  defineProps<{
    text?: string
    /** When true, wordmark navigates to home. Disable if already inside a home link. */
    homeLink?: boolean
  }>(),
  {
    text: 'inboxs',
    homeLink: false,
  },
)

const localePath = useLocalePath()
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

  // Cloned char layers must not steal clicks from parent NuxtLink / nearby chrome.
  root.value.querySelectorAll('span').forEach((el) => {
    ;(el as HTMLElement).style.pointerEvents = 'none'
  })

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
  <NuxtLink
    v-if="homeLink"
    :to="localePath('/')"
    class="inbox-wordmark-link inline-block min-h-[1.25em] min-w-[3ch]"
    :aria-label="text"
  >
    <span
      ref="root"
      dir="ltr"
      class="inbox-wordmark inline-block font-display font-bold tracking-wide"
      aria-hidden="true"
    >{{ text }}</span>
  </NuxtLink>
  <span
    v-else
    ref="root"
    dir="ltr"
    class="inbox-wordmark inline-block min-h-[1.25em] min-w-[3ch] font-display font-bold tracking-wide"
    :aria-label="text"
  >{{ text }}</span>
</template>
