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
  /** Canva phone chrome ≤430px; ≥431px uses sidebar + header + wide main. */
  phoneShell?: boolean
  /** Header avatar opens OwnerAccountDrawer; logout lives in the drawer. */
  useAccountDrawer?: boolean
}>(), {
  wide: false,
  darkNav: false,
  logoutLabel: '',
  hideUser: false,
  hideMobileHeader: false,
  phoneShell: false,
  useAccountDrawer: false,
})

const drawerItems = computed(() => props.sideItems?.length ? props.sideItems : props.items)

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const open = ref(false)
const accountOpen = ref(false)
const accountAnchor = ref<HTMLElement | null>(null)
const holdsNavBodyLock = ref(false)
const {
  logout,
  displayName,
  initials,
  avatarUrl,
  clubAvatarUrl,
  activeOwnerClub,
  profilePath,
  fetch: fetchAuth,
} = useAuth()
const { heldRoles } = usePlatformRoles()
const { localizedField } = useLocalizedField()

/** Owner shell: show club logo/name in the header shortcut (the red circle owners expect). */
const shortcutAvatarUrl = computed(() =>
  props.useAccountDrawer ? (clubAvatarUrl.value || avatarUrl.value) : avatarUrl.value,
)
const shortcutName = computed(() => {
  if (props.useAccountDrawer && activeOwnerClub.value) {
    return localizedField(activeOwnerClub.value, 'nameFa', 'nameEn') || displayName.value
  }
  return displayName.value
})
const shortcutInitials = computed(() => {
  if (!(props.useAccountDrawer && activeOwnerClub.value)) return initials.value
  const name = shortcutName.value
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] || ''}${parts[1]![0] || ''}`.toUpperCase()
  return (name[0] || '?').toUpperCase()
})

function acquireNavLock() {
  if (holdsNavBodyLock.value) return
  acquireModalBodyLock()
  holdsNavBodyLock.value = true
}

function releaseNavLock() {
  if (!holdsNavBodyLock.value) return
  releaseModalBodyLock()
  holdsNavBodyLock.value = false
}

watch(open, (isOpen) => {
  if (!import.meta.client || props.phoneShell) return
  if (isOpen) acquireNavLock()
  else releaseNavLock()
})

const canSwitchRole = computed(() => heldRoles.value.length >= 2)

async function handleLogout() {
  if (props.customLogout) {
    await props.customLogout()
    return
  }
  await logout()
}

const resolvedLogoutLabel = computed(() => props.logoutLabel || t('nav.logout'))

/** Phone artboard only ≤430px — never lock desktop/laptop to 375 / max-w-lg. */
const mainClass = computed(() => {
  if (props.phoneShell) {
    return 'mx-auto w-full max-[430px]:max-w-[var(--sz-phone-width)] overflow-x-hidden px-4 pb-5 pt-0 min-[431px]:mx-0 min-[431px]:max-w-none min-[431px]:overflow-visible min-[431px]:px-8 min-[431px]:py-6'
  }
  return props.wide
    ? 'w-full px-4 py-5 min-[431px]:px-8 min-[431px]:py-8'
    : 'mx-auto w-full max-[430px]:max-w-lg px-4 py-5 min-[431px]:max-w-6xl min-[431px]:px-6 min-[431px]:py-8'
})

const rootClass = computed(() => {
  const base = 'flex min-h-dvh flex-col pb-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom))] min-[431px]:flex-row min-[431px]:pb-0'
  return base
})

const backdropClass = 'fixed inset-0 z-40 bg-black/60 min-[431px]:hidden'

const drawerWrapClass = computed(() => {
  const desktop = 'min-[431px]:static min-[431px]:flex min-[431px]:h-dvh min-[431px]:sticky min-[431px]:top-0 min-[431px]:shrink-0 min-[431px]:!translate-x-0'
  if (props.phoneShell) {
    return `z-50 max-[430px]:hidden min-[431px]:relative ${desktop}`
  }
  return `fixed inset-y-0 z-50 transition-transform ltr:left-0 rtl:right-0 ${desktop}`
})

const drawerStateClass = computed(() => {
  if (props.phoneShell) {
    return 'min-[431px]:!translate-x-0'
  }
  const openState = open.value ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'
  return `${openState} min-[431px]:!translate-x-0`
})

const glassHeaderClass = 'glass-bar sticky top-0 z-30 px-4 py-3 min-[431px]:hidden'

const compactHeaderClass = 'sticky top-0 z-30 flex items-center justify-between gap-2 bg-brand-cream/95 px-4 py-2 backdrop-blur min-[431px]:hidden'

const dashboardRoot = computed(() => {
  const pool = drawerItems.value
  const ownerCal = pool.find((item) => item.to.includes('/owner/calendar'))
  if (ownerCal) return ownerCal.to
  const coachToday = pool.find((item) => {
    const path = item.to.replace(/\/$/, '')
    return path.endsWith('/coach') || path === localePath('/coach')
  })
  if (coachToday) return coachToday.to
  const athleteHub = pool.find((item) => {
    const path = item.to.replace(/\/$/, '')
    return path.endsWith('/athlete') || path === localePath('/athlete')
  })
  if (athleteHub) return athleteHub.to
  return pool.find((item) => !item.action)?.to || localePath('/')
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
    releaseNavLock()
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
  <div :class="rootClass">
    <Teleport to="body">
      <Transition name="venus-modal">
        <div
          v-if="open && !phoneShell"
          :class="backdropClass"
          role="presentation"
          data-dashboard-nav-overlay
          @click="open = false"
        />
      </Transition>
    </Teleport>

    <div :class="[drawerWrapClass, drawerStateClass]">
      <AppSideNav :title="title" :items="drawerItems" :dark="darkNav" />
    </div>

    <div class="min-w-0 flex-1 bg-brand-cream">
      <slot v-if="$slots['top-header']" name="top-header" />
      <template v-else>
        <header v-if="!hideMobileHeader" :class="glassHeaderClass">
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
              <NuxtLink
                v-if="canSwitchRole"
                :to="localePath('/choose-role')"
                class="btn-ghost px-3 py-2 text-xs"
              >
                {{ t('auth.changeRole') }}
              </NuxtLink>
              <AppUserShortcut
                v-if="displayName && !hideUser"
                :to="profilePath"
                :name="shortcutName"
                :avatar-url="shortcutAvatarUrl"
                :initials="shortcutInitials"
                compact
                class="sm:hidden"
              />
              <AppUserShortcut
                v-if="displayName && !hideUser"
                :to="profilePath"
                :name="shortcutName"
                :avatar-url="shortcutAvatarUrl"
                :initials="shortcutInitials"
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
        <div v-else-if="!phoneShell" :class="compactHeaderClass">
          <button type="button" class="btn-ghost px-2 py-1.5 text-xs" @click="open = true" :aria-label="t('common.menu')">
            <AppIcon name="menu" size="sm" />
          </button>
          <InboxBrandLockup home-link height-class="h-6" />
          <button type="button" class="btn-ghost px-2 py-1.5 text-xs" @click="handleLogout" :aria-label="resolvedLogoutLabel">
            <AppIcon name="logout" size="sm" />
          </button>
        </div>

        <div class="hidden border-b border-brand-gray-200 bg-brand-cream px-6 py-4 min-[431px]:flex min-[431px]:items-center min-[431px]:justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <InboxBrandLockup home-link height-class="h-7" />
            <button
              v-if="!(useAccountDrawer && isDashboardRoot)"
              type="button"
              class="canva-home-login canva-home-login-soft px-3 py-2 text-xs"
              @click="goBack"
            >
              <span class="inline-flex items-center gap-1.5">
                <AppIcon name="arrow_back" size="sm" />
                {{ t('common.back') }}
              </span>
            </button>
          </div>
          <div class="flex items-center gap-2">
            <NuxtLink
              v-if="canSwitchRole"
              :to="localePath('/choose-role')"
              class="canva-home-login canva-home-login-soft px-3 py-2 text-xs"
            >
              {{ t('auth.changeRole') }}
            </NuxtLink>
            <div v-if="displayName && !hideUser && useAccountDrawer" ref="accountAnchor" class="inline-flex">
              <AppUserShortcut
                :name="shortcutName"
                :avatar-url="shortcutAvatarUrl"
                :initials="shortcutInitials"
                :expanded="accountOpen"
                @click="accountOpen = true"
              />
            </div>
            <AppUserShortcut
              v-else-if="displayName && !hideUser"
              :to="profilePath"
              :name="shortcutName"
              :avatar-url="shortcutAvatarUrl"
              :initials="shortcutInitials"
            />
            <button
              v-if="!useAccountDrawer"
              type="button"
              class="canva-home-login canva-home-login-soft px-3 py-2 text-xs"
              @click="handleLogout"
            >
              <span class="inline-flex items-center gap-1.5">
                <AppIcon name="logout" size="sm" />
                {{ resolvedLogoutLabel }}
              </span>
            </button>
          </div>
        </div>
      </template>
      <OwnerAccountDrawer
        v-if="useAccountDrawer"
        :open="accountOpen"
        :anchor="accountAnchor"
        @close="accountOpen = false"
      />

      <main :class="mainClass">
        <slot />
      </main>
    </div>

    <AppBottomNav
      :items="items"
      :dark="darkNav"
      :max-width-class="phoneShell ? 'canva-phone-shell' : 'max-w-lg'"
    />
  </div>
</template>
