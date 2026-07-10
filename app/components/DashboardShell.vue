<script setup lang="ts">
import type { NavItem } from '#shared/nav.ts'

const props = withDefaults(defineProps<{
  title: string
  items: NavItem[]
  wide?: boolean
  darkNav?: boolean
}>(), {
  wide: false,
  darkNav: false,
})

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const open = ref(false)
const { logout, displayName, initials, avatarUrl, profilePath, fetch: fetchAuth } = useAuth()

async function handleLogout() {
  await logout()
}

const mainClass = computed(() => {
  return props.wide ? 'w-full px-4 py-4 lg:px-6 lg:py-6' : 'mx-auto w-full max-w-lg px-4 py-4 lg:max-w-4xl lg:px-6 lg:py-6'
})

const dashboardRoot = computed(() => props.items[0]?.to || localePath('/'))
const isDashboardRoot = computed(() => route.path === dashboardRoot.value)

function onKeydown(event: KeyboardEvent) {
  if (open.value && event.key === 'Escape') {
    open.value = false
  }
}

onMounted(() => {
  if (import.meta.client) {
    document.addEventListener('keydown', onKeydown)
  }
  if (!displayName.value) fetchAuth()
})

onUnmounted(() => {
  if (import.meta.client) {
    document.removeEventListener('keydown', onKeydown)
  }
})

function goBack() {
  if (isDashboardRoot.value) {
    return navigateTo(localePath('/'))
  }

  window.history.length > 1 ? window.history.back() : navigateTo(dashboardRoot.value)
}
</script>

<template>
  <div class="flex min-h-dvh flex-col pb-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom))] lg:flex-row lg:pb-0">
    <div v-if="open" class="fixed inset-0 z-40 bg-black/60 lg:hidden" role="presentation" @click="open = false" />

    <div
      class="fixed inset-y-0 z-50 transition-transform ltr:left-0 rtl:right-0 lg:static lg:translate-x-0 lg:ltr:translate-x-0 lg:rtl:translate-x-0"
      :class="open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full lg:translate-x-0 lg:ltr:translate-x-0 lg:rtl:translate-x-0'"
    >
      <AppSideNav :title="title" :items="items" :dark="darkNav" />
    </div>

    <div class="min-w-0 flex-1">
      <header class="glass-bar sticky top-0 z-30 px-4 py-3 lg:hidden">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="open = true">
              <span class="inline-flex items-center gap-1.5">
                <AppIcon name="menu" size="sm" />
                {{ t('common.menu') }}
              </span>
            </button>
            <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="goBack">
              <span class="inline-flex items-center gap-1.5">
                <AppIcon name="arrow_back" size="sm" />
                {{ t('common.back') }}
              </span>
            </button>
          </div>
          <p class="min-w-0 truncate font-display text-base font-bold">{{ title }}</p>
          <div class="flex min-w-0 items-center gap-2">
            <AppUserShortcut
              v-if="displayName"
              :to="profilePath"
              :name="displayName"
              :avatar-url="avatarUrl"
              :initials="initials"
              compact
              class="sm:hidden"
            />
            <AppUserShortcut
              v-if="displayName"
              :to="profilePath"
              :name="displayName"
              :avatar-url="avatarUrl"
              :initials="initials"
              class="hidden sm:inline-flex"
            />
            <NuxtLink :to="localePath('/')" class="btn-ghost px-3 py-2 text-xs">
              <span class="inline-flex items-center gap-1.5">
                <AppIcon name="home" size="sm" />
                {{ t('nav.home') }}
              </span>
            </NuxtLink>
            <LocaleSwitcher />
            <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="handleLogout">
              <span class="inline-flex items-center gap-1.5">
                <AppIcon name="logout" size="sm" />
                {{ t('nav.logout') }}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div class="hidden border-b border-brand-gray-100 bg-white px-6 py-4 shadow-venus-sm lg:flex lg:items-center lg:justify-between">
        <div class="flex items-center gap-2">
          <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="goBack">
            <span class="inline-flex items-center gap-1.5">
              <AppIcon name="arrow_back" size="sm" />
              {{ t('common.back') }}
            </span>
          </button>
          <NuxtLink :to="localePath('/')" class="btn-ghost px-3 py-2 text-xs">
            <span class="inline-flex items-center gap-1.5">
              <AppIcon name="home" size="sm" />
              {{ t('nav.home') }}
            </span>
          </NuxtLink>
        </div>
        <LocaleSwitcher />
        <AppUserShortcut
          v-if="displayName"
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
      </div>

      <main :class="mainClass">
        <slot />
      </main>
    </div>

    <AppBottomNav :items="items" :dark="darkNav" max-width-class="max-w-lg" />
  </div>
</template>
