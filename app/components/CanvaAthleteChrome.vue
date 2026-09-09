<script setup lang="ts">
/**
 * Athlete tab chrome: INBOX wordmark + profile shortcut (home/favorites pattern).
 * Use on primary tabs that lack a photo hero, e.g. bookings history.
 */
defineProps<{
  /** Extra actions between logo and profile (e.g. notifications). */
  dark?: boolean
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { canSwitchRole } = usePlatformRoles()
</script>

<template>
  <header class="canva-home-chrome hidden max-[430px]:flex">
    <NuxtLink :to="localePath('/')" class="flex min-w-0 items-center gap-2" :aria-label="t('brand.name')">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 shrink-0" />
      <InboxWordmark class="text-base" :class="dark ? 'text-white' : 'text-brand-primary'" />
    </NuxtLink>
    <div class="flex flex-col items-stretch gap-1">
      <div class="flex items-center gap-3" :class="dark ? 'text-white' : 'text-brand-navy'">
        <slot />
        <NuxtLink :to="localePath('/athlete')" :aria-label="t('nav.profile')">
          <AppIcon name="person" size="sm" />
        </NuxtLink>
      </div>
      <NuxtLink
        v-if="canSwitchRole"
        :to="localePath('/choose-role')"
        class="text-center text-[11px] font-semibold"
        :class="dark ? 'text-white' : 'text-brand-primary'"
      >
        {{ t('auth.changeRole') }}
      </NuxtLink>
    </div>
  </header>
</template>
