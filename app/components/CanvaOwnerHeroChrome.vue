<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { initials, avatarUrl } = useAuth()
const accountOpen = ref(false)
const avatarBtn = ref<HTMLButtonElement | null>(null)
const notificationsPath = computed(() => localePath('/owner/notifications'))
</script>

<template>
  <div class="canva-photo-hero-top">
    <NuxtLink :to="localePath('/')" class="flex items-center gap-2" :aria-label="t('brand.name')">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 shrink-0 brightness-0 invert">
      <InboxWordmark text="INBOX" class="text-base text-white" />
    </NuxtLink>
    <div class="flex items-center gap-3 text-white">
      <NuxtLink :to="notificationsPath" :aria-label="t('notifications.title')">
        <AppIcon name="notifications" size="sm" />
      </NuxtLink>
      <button
        ref="avatarBtn"
        type="button"
        class="canva-owner-avatar"
        :aria-label="t('owner.account.title')"
        :aria-expanded="accountOpen"
        aria-haspopup="dialog"
        @click="accountOpen = true"
      >
        <img v-if="avatarUrl" :src="avatarUrl" alt="" class="h-full w-full object-cover">
        <span v-else>{{ initials }}</span>
      </button>
    </div>
  </div>
  <OwnerAccountDrawer :open="accountOpen" :anchor="avatarBtn" @close="accountOpen = false" />
</template>
