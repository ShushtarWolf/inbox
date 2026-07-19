<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { user, fetch: fetchAuth, logout, displayName, initials, avatarUrl, profilePath } = useAuth()
const { openGate } = useAuthFlow()

async function handleLogout() {
  await logout()
}

const nav = computed(() => {
  const meTarget = !user.value
    ? localePath('/login')
    : dashboardPathForRole(user.value.role)

  // Court booking is primary; coach discovery is off main nav (and gated by pilotNoCoach).
  return [
    { to: localePath('/'), label: t('nav.home'), icon: 'home' },
    { to: localePath('/clubs'), label: t('nav.clubs'), icon: 'sports_tennis' },
    { to: meTarget, label: t('nav.me'), icon: 'account_circle' },
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
        <template v-if="!user">
          <button type="button" class="btn-primary px-4 py-2 text-xs" @click="openGate()">
            <span class="inline-flex items-center gap-1.5">
              <AppIcon name="login" size="sm" />
              {{ t('auth.loginRegister') }}
            </span>
          </button>
        </template>
        <template v-else>
          <AppUserShortcut
            :to="profilePath"
            :name="displayName"
            :avatar-url="avatarUrl"
            :initials="initials"
          />
          <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="handleLogout">
            <span class="inline-flex items-center gap-1.5">
              <AppIcon name="logout" size="sm" />
              {{ t('nav.logout') }}
            </span>
          </button>
        </template>
      </template>
    </AppTopBar>
    <main class="app-shell-main mx-auto w-full max-w-lg flex-1 px-4 py-5 lg:max-w-6xl lg:px-6 lg:py-8">
      <slot />
    </main>
    <footer class="mx-auto w-full max-w-lg px-4 pb-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom)+0.5rem)] text-center text-xs font-medium text-brand-gray-600 lg:max-w-6xl lg:pb-4">
      <p class="mb-2">
        <span class="font-bold text-brand-navy">{{ t('contact.us') }}</span>
        ·
        <a href="mailto:info@inboxs.ir" class="px-1 hover:text-brand-primary" dir="ltr">info@inboxs.ir</a>
        ·
        <a href="tel:+989124777927" class="px-1 tabular-nums hover:text-brand-primary" dir="ltr">09124777927</a>
      </p>
      <div class="mb-2 flex justify-center">
        <EnamadBadge />
      </div>
      <div class="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
        <NuxtLink :to="localePath('/about')" class="px-1.5 hover:text-brand-primary">{{ t('legal.about') }}</NuxtLink>
        ·
        <NuxtLink :to="localePath('/contact')" class="px-1.5 hover:text-brand-primary">{{ t('legal.contact') }}</NuxtLink>
        ·
        <NuxtLink :to="localePath('/pricing')" class="px-1.5 hover:text-brand-primary">{{ t('legal.pricing') }}</NuxtLink>
        ·
        <NuxtLink :to="localePath('/complaints')" class="px-1.5 hover:text-brand-primary">{{ t('legal.complaints') }}</NuxtLink>
        ·
        <NuxtLink :to="localePath('/cancellation')" class="px-1.5 hover:text-brand-primary">{{ t('legal.cancellation') }}</NuxtLink>
        ·
        <NuxtLink :to="localePath('/privacy')" class="px-1.5 hover:text-brand-primary">{{ t('legal.privacy') }}</NuxtLink>
        ·
        <NuxtLink :to="localePath('/terms')" class="px-1.5 hover:text-brand-primary">{{ t('legal.terms') }}</NuxtLink>
        ·
        <NuxtLink :to="localePath('/clubs/apply')" class="px-1.5 hover:text-brand-primary">{{ t('clubs.applyLink') }}</NuxtLink>
      </div>
    </footer>
    <AppBottomNav :items="nav" />
    <AuthFlowModal />
  </div>
</template>
