<script setup lang="ts">
/**
 * Coach primary-tab photo hero — HTML mobShell: logo + bell + square navy avatar.
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
const { canSwitchRole } = usePlatformRoles()
</script>

<template>
  <section class="canva-photo-hero">
    <CanvaHeroImg
      :src="src"
      alt=""
      img-class="canva-photo-hero-media"
      img-style="filter: grayscale(0.55) brightness(0.72);"
    />
    <div class="canva-photo-hero-wash" />
    <div class="canva-photo-hero-top">
      <InboxBrandLockup home-link on-dark height-class="h-7" />
      <div class="flex flex-col items-stretch gap-1">
        <div class="flex items-center gap-3 text-white">
          <NuxtLink
            :to="localePath('/coach/settings')"
            class="inline-flex"
            :aria-label="t('notifications.title')"
          >
            <AppIcon name="notifications" size="sm" />
          </NuxtLink>
          <NuxtLink
            :to="localePath('/coach/profile')"
            class="canva-owner-avatar"
            :aria-label="t('nav.profile')"
          >
            <img v-if="avatarUrl" :src="avatarUrl" alt="" class="h-full w-full object-cover">
            <span v-else>{{ initials }}</span>
          </NuxtLink>
        </div>
        <NuxtLink
          v-if="canSwitchRole"
          :to="localePath('/choose-role')"
          class="text-center text-[11px] font-semibold text-white"
        >
          {{ t('auth.changeRole') }}
        </NuxtLink>
      </div>
    </div>
    <div class="canva-photo-hero-body !min-h-[9.5rem] !pb-8 min-[431px]:!min-h-[3.25rem] min-[431px]:!pb-3 min-[431px]:!pt-3">
      <slot />
    </div>
  </section>
</template>
