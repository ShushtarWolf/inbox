<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { initials, avatarUrl, clubAvatarUrl, activeOwnerClub } = useAuth()
const { localizedField } = useLocalizedField()
const { canSwitchRole } = usePlatformRoles()
const accountOpen = ref(false)
const avatarBtn = ref<HTMLButtonElement | null>(null)
const notificationsPath = computed(() => localePath('/owner/notifications'))
const heroAvatarUrl = computed(() => clubAvatarUrl.value || avatarUrl.value)
const heroInitials = computed(() => {
  if (!activeOwnerClub.value) return initials.value
  const name = localizedField(activeOwnerClub.value, 'nameFa', 'nameEn') || ''
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] || ''}${parts[1]![0] || ''}`.toUpperCase()
  return (name[0] || initials.value[0] || '?').toUpperCase()
})
</script>

<template>
  <div class="canva-photo-hero-top">
    <NuxtLink :to="localePath('/')" class="flex items-center gap-2" :aria-label="t('brand.name')">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 shrink-0 brightness-0 invert">
      <InboxWordmark text="INBOX" class="text-base text-white" />
    </NuxtLink>
    <div class="flex flex-col items-stretch gap-1">
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
          <img v-if="heroAvatarUrl" :src="heroAvatarUrl" alt="" class="h-full w-full object-cover">
          <span v-else>{{ heroInitials }}</span>
        </button>
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
  <OwnerAccountDrawer :open="accountOpen" :anchor="avatarBtn" @close="accountOpen = false" />
</template>
