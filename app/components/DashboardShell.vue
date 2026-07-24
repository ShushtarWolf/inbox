<script setup lang="ts">
import type { NavItem } from '#shared/nav.ts'

const props = withDefaults(defineProps<{
  title: string
  items: NavItem[]
  /** Optional fuller nav for desktop/drawer; bottom nav still uses `items`. */
  sideItems?: NavItem[]
  wide?: boolean
  darkNav?: boolean
  logoutLabel?: string
  customLogout?: () => void | Promise<void>
  hideUser?: boolean
  /** Hide sticky mobile glass header (Canva pages supply their own hero). */
  hideMobileHeader?: boolean
}>(), {
  wide: false,
  darkNav: false,
  logoutLabel: '',
  hideUser: false,
  hideMobileHeader: false,
})

const drawerItems = computed(() => props.sideItems?.length ? props.sideItems : props.items)

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const open = ref(false)
const { logout, displayName, initials, avatarUrl, profilePath, fetch: fetchAuth } = useAuth()

async function handleLogout() {
  if (props.customLogout) {
    await props.customLogout()
    return
  }
  await logout()
}

const resolvedLogoutLabel = computed(() => props.logoutLabel || t('nav.logout'))

const mainClass = computed(() => {
  return props.wide ? 'w-full px-4 py-5 lg:px-8 lg:py-8' : 'mx-auto w-full max-w-lg px-4 py-5 lg:max-w-4xl lg:px-6 lg:py-8'
})

const dashboardRoot = computed(() => {
  const pool = drawerItems.value
  const home = pool.find((item) => item.to === localePath('/owner') || item.to.endsWith('/owner'))
  return home?.to || pool[0]?.to || localePath('/')
})
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
  if (!props.hideUser && !displayName.value) fetchAuth()
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
      <AppSideNav :title="title" :items="drawerItems" :dark="darkNav" />
    </div>

    <div class="min-w-0 flex-1 bg-brand-cream">
      <header v-if="!hideMobileHeader" class="glass-bar sticky top-0 z-30 px-4 py-3 lg:hidden">
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
              v-if="displayName && !hideUser"
              :to="profilePath"
              :name="displayName"
              :avatar-url="avatarUrl"
              :initials="initials"
              compact
              class="sm:hidden"
            />
            <AppUserShortcut
              v-if="displayName && !hideUser"
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
            <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="handleLogout">
              <span class="inline-flex items-center gap-1.5">
                <AppIcon name="logout" size="sm" />
                {{ resolvedLogoutLabel }}
              </span>
            </button>
          </div>
        </div>
      </header>
      <div v-else class="sticky top-0 z-30 flex items-center justify-between gap-2 bg-brand-cream/95 px-4 py-2 backdrop-blur lg:hidden">
        <button type="button" class="btn-ghost px-2 py-1.5 text-xs" @click="open = true" :aria-label="t('common.menu')">
          <AppIcon name="menu" size="sm" />
        </button>
        <img src="/brand/inbox-logo-mark.svg" alt="inbox" class="h-7 w-7" />
        <button type="button" class="btn-ghost px-2 py-1.5 text-xs" @click="handleLogout" :aria-label="resolvedLogoutLabel">
          <AppIcon name="logout" size="sm" />
        </button>
      </div>

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
        <AppUserShortcut
          v-if="displayName && !hideUser"
          :to="profilePath"
          :name="displayName"
          :avatar-url="avatarUrl"
          :initials="initials"
        />
        <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="handleLogout">
          <span class="inline-flex items-center gap-1.5">
            <AppIcon name="logout" size="sm" />
            {{ resolvedLogoutLabel }}
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
