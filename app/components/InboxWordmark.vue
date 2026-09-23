<script setup lang="ts">
/**
 * inboxs logotype with CSS scan/cut animation (uiverse rude-robin-51 adapted).
 * Keep dir=ltr so RTL pages do not reverse the Latin brand (INBOX → xobni).
 * Use for the wordmark only — keep the logo mark SVG separate.
 */
withDefaults(
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
</script>

<template>
  <NuxtLink
    v-if="homeLink"
    :to="localePath('/')"
    class="inbox-wordmark-link inline-block min-h-[1.25em] min-w-[3ch]"
    :aria-label="text"
  >
    <span
      dir="ltr"
      class="inbox-wordmark inline-block font-display font-bold tracking-wide"
      aria-hidden="true"
    >
      <span class="inbox-wordmark-text">{{ text }}</span>
    </span>
  </NuxtLink>
  <span
    v-else
    dir="ltr"
    class="inbox-wordmark inline-block min-h-[1.25em] min-w-[3ch] font-display font-bold tracking-wide"
    :aria-label="text"
  >
    <span class="inbox-wordmark-text" aria-hidden="true">{{ text }}</span>
  </span>
</template>
