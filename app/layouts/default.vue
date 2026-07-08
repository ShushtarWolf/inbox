<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const nav = computed(() => [
  { to: localePath('/'), label: t('nav.home'), icon: '🏠' },
  { to: localePath('/clubs'), label: t('nav.clubs'), icon: '🎾' },
  { to: localePath('/coaches'), label: t('nav.coaches'), icon: '👤' },
  { to: localePath('/athlete'), label: t('nav.me'), icon: '📋' },
])
</script>

<template>
  <div class="flex min-h-dvh flex-col pb-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom))] lg:pb-0">
    <AppTopBar :nav="nav">
      <template #actions>
        <LocaleSwitcher />
        <NuxtLink :to="localePath('/login')" class="text-sm font-semibold text-brand-primary">
          {{ t('nav.login') }}
        </NuxtLink>
      </template>
    </AppTopBar>
    <main class="app-shell-main mx-auto w-full max-w-lg flex-1 px-4 py-4 lg:max-w-6xl lg:px-6 lg:py-6">
      <slot />
    </main>
    <AppBottomNav :items="nav" />
  </div>
</template>
