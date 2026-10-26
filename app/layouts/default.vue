<script setup lang="ts">
import type { NavItem } from '#shared/nav.ts'

const { t } = useI18n()
const localePath = useLocalePath()
const { formatPhone } = useFormatters()
const { user, loggedIn, fetch: fetchAuth, logout, displayName, initials, avatarUrl } = useAuth()
/** Reserve tab-bar space from session cookie before profile hydrates (CLS on /coaches). */
const reserveTabBar = computed(() => Boolean(user.value || loggedIn.value))
const { openGate } = useAuthFlow()
const { smsLive } = useSmsCapability()
const { pilotNoCoach, competitionsEnabled } = usePilotFlags()
const { activeRole, canSwitchRole, signedInHomePath } = usePlatformRoles()

const activeRoleLabel = computed(() => {
  const role = activeRole.value
  if (!role) return ''
  return t(`admin.roles.${role}`)
})

async function handleLogout() {
  await logout()
}

const nav = computed((): NavItem[] => {
  // Guest: no bottom tab bar — login lives in CanvaPublicChrome / AppTopBar only.
  // Logged-in: home/clubs/coaches/competitions only — dashboard/schedule via name/avatar chrome.
  const items: NavItem[] = [
    { to: localePath('/'), label: t('nav.home'), icon: 'home' },
    { to: localePath('/clubs'), label: t('nav.clubs'), icon: 'sports_tennis' },
  ]

  if (!pilotNoCoach.value) {
    items.push({
      to: localePath('/coaches'),
      label: t('nav.coaches'),
      icon: 'sports',
    })
  }

  if (competitionsEnabled.value) {
    items.push({
      to: localePath('/competitions'),
      label: t('competitions.nav'),
      icon: 'emoji_events',
    })
  }

  return items
})

onMounted(() => {
  if (!user.value) fetchAuth()
})
</script>

<template>
  <div
    class="flex min-h-dvh flex-col min-[431px]:pb-0"
    :class="reserveTabBar ? 'pb-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom))]' : ''"
  >
    <div class="hidden min-[431px]:block">
      <AppTopBar :nav="nav" variant="publicHead" max-width-class="max-w-[1180px]">
        <template #actions>
          <template v-if="!user">
            <button
              type="button"
              class="canva-home-login"
              @click="openGate({ smsLive })"
            >
              <span class="inline-flex items-center gap-1.5">
                <AppIcon name="login" size="sm" />
                {{ t('auth.loginRegister') }}
              </span>
            </button>
          </template>
          <template v-else>
            <span
              v-if="activeRoleLabel"
              class="hidden text-xs font-semibold text-brand-navy sm:inline"
            >
              {{ activeRoleLabel }}
            </span>
            <NuxtLink
              v-if="canSwitchRole"
              :to="localePath('/choose-role')"
              class="canva-home-login canva-home-login-soft px-3 py-2 text-xs"
            >
              {{ t('auth.changeRole') }}
            </NuxtLink>
            <AppUserShortcut
              :to="signedInHomePath"
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
    </div>
    <main class="app-shell-main canva-public-main mx-auto w-full max-[430px]:max-w-lg flex-1 px-4 py-5 min-[431px]:max-w-[1180px] min-[431px]:px-6 min-[431px]:pb-8 min-[431px]:pt-4">
      <slot />
    </main>
    <footer
      class="canva-public-footer w-full text-xs font-medium text-brand-gray-600"
      :class="reserveTabBar
        ? 'pb-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom)+0.5rem)]'
        : 'pb-[calc(var(--sz-safe-bottom)+0.5rem)]'"
    >
      <div class="site-rfoot hidden min-[431px]:block">
        <div class="mx-auto w-full max-w-[1180px] px-6">
          <div class="site-rfoot-grid">
            <div>
              <InboxBrandLockup home-link on-dark height-class="h-7" />
              <p class="site-rfoot-blurb">{{ t('siteFooter.blurb') }}</p>
            </div>
            <div>
              <h2 class="site-rfoot-title">{{ t('siteFooter.athletes') }}</h2>
              <nav class="site-rfoot-links" :aria-label="t('siteFooter.athletes')">
                <NuxtLink :to="localePath('/clubs')">{{ t('siteFooter.searchCourts') }}</NuxtLink>
                <NuxtLink v-if="!pilotNoCoach" :to="localePath('/coaches')">{{ t('siteFooter.coaches') }}</NuxtLink>
                <NuxtLink :to="localePath('/athlete/bookings')">{{ t('athlete.bookingsTileTitle') }}</NuxtLink>
              </nav>
            </div>
            <div>
              <h2 class="site-rfoot-title">{{ t('siteFooter.venues') }}</h2>
              <nav class="site-rfoot-links" :aria-label="t('siteFooter.venues')">
                <NuxtLink :to="localePath('/clubs/apply')">{{ t('clubs.applyLink') }}</NuxtLink>
                <NuxtLink :to="localePath('/owner/calendar')">{{ t('siteFooter.ownerPanel') }}</NuxtLink>
                <NuxtLink :to="localePath('/owner/reserve/season')">{{ t('siteFooter.season') }}</NuxtLink>
              </nav>
            </div>
            <div>
              <h2 class="site-rfoot-title" dir="ltr">Inbox</h2>
              <nav class="site-rfoot-links" aria-label="Inbox">
                <NuxtLink :to="localePath('/about')">{{ t('legal.about') }}</NuxtLink>
                <NuxtLink :to="localePath('/contact')">{{ t('legal.contact') }}</NuxtLink>
                <NuxtLink :to="localePath('/terms')">{{ t('legal.terms') }}</NuxtLink>
                <NuxtLink :to="localePath('/privacy')">{{ t('legal.privacy') }}</NuxtLink>
              </nav>
            </div>
          </div>
          <p class="site-rfoot-contact">
            <span class="font-bold text-white">{{ t('contact.us') }}</span>
            ·
            <a href="mailto:info@inboxs.ir" class="px-1" dir="ltr">info@inboxs.ir</a>
            ·
            <a href="tel:+989124777927" class="px-1 tabular-nums" dir="ltr">{{ formatPhone('09124777927') }}</a>
          </p>
          <nav class="site-rfoot-legal" :aria-label="t('legal.about')">
            <NuxtLink :to="localePath('/pricing')">{{ t('legal.pricing') }}</NuxtLink>
            <NuxtLink :to="localePath('/complaints')">{{ t('legal.complaints') }}</NuxtLink>
            <NuxtLink :to="localePath('/cancellation')">{{ t('legal.cancellation') }}</NuxtLink>
          </nav>
        </div>
      </div>
      <div class="mx-auto w-full max-[430px]:max-w-lg px-4 pt-3 text-center min-[431px]:max-w-[1180px]">
        <div class="mb-2 flex justify-center">
          <EnamadBadge />
        </div>
        <nav class="canva-legal-footer min-[431px]:hidden" :aria-label="t('legal.about')">
          <NuxtLink :to="localePath('/about')" class="hover:text-brand-primary">{{ t('legal.about') }}</NuxtLink>
          <span class="text-brand-gray-300" aria-hidden="true">·</span>
          <NuxtLink :to="localePath('/contact')" class="hover:text-brand-primary">{{ t('legal.contact') }}</NuxtLink>
          <span class="text-brand-gray-300" aria-hidden="true">·</span>
          <NuxtLink :to="localePath('/privacy')" class="hover:text-brand-primary">{{ t('legal.privacy') }}</NuxtLink>
          <span class="text-brand-gray-300" aria-hidden="true">·</span>
          <NuxtLink :to="localePath('/terms')" class="hover:text-brand-primary">{{ t('legal.terms') }}</NuxtLink>
        </nav>
      </div>
    </footer>
    <AppBottomNav v-if="user" :items="nav" />
  </div>
</template>
