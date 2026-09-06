<script setup lang="ts">
/**
 * Coach primary-tab photo hero — borrows owner Canva chrome (no dedicated coach frames).
 * Pages supply optional body slot; default is an empty band for shell flush.
 */
withDefaults(defineProps<{
  /** Hero image under the wash. */
  src?: string
}>(), {
  src: '/hero/tennis-court.jpg',
})

const { t } = useI18n()
const localePath = useLocalePath()
const { initials, avatarUrl } = useAuth()
</script>

<template>
  <section class="canva-photo-hero -mx-4 min-[431px]:mx-0">
    <img
      :src="src"
      alt=""
      class="canva-photo-hero-media"
      style="filter: grayscale(0.55) brightness(0.72);"
      decoding="async"
    >
    <div class="canva-photo-hero-wash" />
    <div class="canva-photo-hero-top">
      <NuxtLink :to="localePath('/')" class="flex items-center gap-2" :aria-label="t('brand.name')">
        <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 shrink-0 brightness-0 invert">
        <InboxWordmark text="INBOX" class="text-base text-white" />
      </NuxtLink>
      <div class="flex items-center gap-3 text-white">
        <NuxtLink
          :to="localePath('/coach/profile')"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden bg-[#c41e1e] text-[10px] font-bold text-white"
          style="border-radius: var(--sz-canva-radius);"
          :aria-label="t('nav.profile')"
        >
          <img v-if="avatarUrl" :src="avatarUrl" alt="" class="h-full w-full object-cover">
          <span v-else>{{ initials }}</span>
        </NuxtLink>
      </div>
    </div>
    <div class="canva-photo-hero-body !min-h-[9.5rem] !pb-8 min-[431px]:!min-h-[3.25rem] min-[431px]:!pb-3 min-[431px]:!pt-3">
      <slot />
    </div>
  </section>
</template>
