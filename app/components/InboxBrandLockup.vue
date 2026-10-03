<script setup lang="ts">
/**
 * Official INBOX mark+wordmark lockup (LTR Latin brand).
 * Prefer this over mark + InboxWordmark pairs.
 */
withDefaults(
  defineProps<{
    /** When true, lockup navigates to home. Disable if already inside a home link. */
    homeLink?: boolean
    /** White lockup for dark/photo heroes (CSS invert). */
    onDark?: boolean
    /** Height classes — width follows aspect ratio (~3.1:1). */
    heightClass?: string
  }>(),
  {
    homeLink: false,
    onDark: false,
    heightClass: 'h-7',
  },
)

const localePath = useLocalePath()
const { t } = useI18n()
</script>

<template>
  <NuxtLink
    v-if="homeLink"
    :to="localePath('/')"
    class="inbox-brand-lockup-link inline-flex shrink-0"
    :aria-label="t('brand.name')"
  >
    <img
      src="/brand/inbox-logo-lockup.svg"
      alt=""
      dir="ltr"
      class="inbox-brand-lockup w-auto shrink-0"
      :class="[heightClass, onDark ? 'brightness-0 invert' : '']"
    >
  </NuxtLink>
  <img
    v-else
    src="/brand/inbox-logo-lockup.svg"
    alt=""
    dir="ltr"
    class="inbox-brand-lockup w-auto shrink-0"
    :class="[heightClass, onDark ? 'brightness-0 invert' : '']"
    :aria-hidden="true"
  >
</template>
