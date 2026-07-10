<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { user, fetch: fetchAuth, logout, displayName, initials, avatarUrl, profilePath } = useAuth()

async function handleLogout() {
  await logout()
}

const nav = computed(() => {
  const meTarget = !user.value
    ? localePath('/login')
    : dashboardPathForRole(user.value.role)

  return [
    { to: localePath('/'), label: t('nav.home'), icon: '🏠' },
    { to: localePath('/clubs'), label: t('nav.clubs'), icon: '🎾' },
    { to: localePath('/coaches'), label: t('nav.coaches'), icon: '👤' },
    { to: meTarget, label: t('nav.me'), icon: '📋' },
  ]
})

onMounted(() => {
  if (!user.value) fetchAuth()
})
</script>

<template>
  <div class="flex min-h-dvh flex-col pb-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom))] lg:pb-0">
    <AppTopBar :nav="nav">
      <template #actions>
        <LocaleSwitcher />
        <template v-if="!user">
          <NuxtLink :to="localePath('/login')" class="text-sm font-semibold text-brand-primary">
            {{ t('nav.login') }}
          </NuxtLink>
        </template>
        <template v-else>
          <AppUserShortcut
            :to="profilePath"
            :name="displayName"
            :avatar-url="avatarUrl"
            :initials="initials"
          />
          <button type="button" class="text-sm font-semibold text-brand-gray-600" @click="handleLogout">
            {{ t('nav.logout') }}
          </button>
        </template>
      </template>
    </AppTopBar>
    <main class="app-shell-main mx-auto w-full max-w-lg flex-1 px-4 py-4 lg:max-w-6xl lg:px-6 lg:py-6">
      <slot />
    </main>
    <footer class="mx-auto w-full max-w-lg px-4 pb-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom)+0.5rem)] text-center text-xs text-brand-gray-600 lg:max-w-6xl lg:pb-4">
      <NuxtLink :to="localePath('/privacy')" class="px-2">{{ t('legal.privacy') }}</NuxtLink>
      ·
      <NuxtLink :to="localePath('/clubs/apply')" class="px-2">{{ t('clubs.applyLink') }}</NuxtLink>
      ·
      <NuxtLink :to="localePath('/terms')" class="px-2">{{ t('legal.terms') }}</NuxtLink>
    </footer>
    <AppBottomNav :items="nav" />
  </div>
</template>
