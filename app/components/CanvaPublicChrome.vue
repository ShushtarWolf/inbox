<script setup lang="ts">
/**
 * Shared public phone chrome: INBOX logo + login / signed-in shortcut.
 * On the homepage the logo is branding-only (bottom nav Home → /).
 * Optional backTo keeps funnel pages escapable without relying only on bottom nav.
 */
const props = defineProps<{
  /** Locale path or path+query for back (e.g. `/clubs` or `/clubs/foo`). */
  backTo?: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { user, fetch: fetchAuth, firstName, dashboardPathForRole } = useAuth()
const { openGate } = useAuthFlow()
const { smsLive } = useSmsCapability()

const firstNameOrGuest = computed(() => firstName.value || t('home.guestName'))

/** True on public homepage so logo is branding-only (bottom nav already links home). */
const isHome = computed(() => {
  const path = route.path.replace(/\/$/, '') || '/'
  return path === '/' || path === localePath('/')
})

const backHref = computed(() => {
  if (!props.backTo) return ''
  if (props.backTo.includes('?')) {
    const [path, qs] = props.backTo.split('?')
    const query = Object.fromEntries(new URLSearchParams(qs))
    return localePath({ path: path || '/', query })
  }
  return localePath(props.backTo)
})

onMounted(() => {
  if (!user.value) fetchAuth()
})
</script>

<template>
  <!-- Phone Canva chrome only (≤430). ≥431 uses AppTopBar — one login control max. -->
  <header class="canva-home-chrome hidden max-[430px]:flex">
    <div class="flex min-w-0 items-center gap-2">
      <NuxtLink
        v-if="backTo"
        :to="backHref"
        class="inline-flex shrink-0 text-brand-navy"
        :aria-label="t('common.back')"
      >
        <AppIcon name="arrow_forward" size="sm" />
      </NuxtLink>
      <!-- On home, brand is not a link (bottom nav Home already → /). Elsewhere logo goes home. -->
      <NuxtLink
        v-if="!isHome"
        :to="localePath('/')"
        class="flex min-w-0 items-center gap-2"
        :aria-label="t('brand.name')"
      >
        <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 shrink-0" />
        <span class="font-display text-lg font-bold tracking-wide text-brand-primary">INBOX</span>
      </NuxtLink>
      <div v-else class="flex min-w-0 items-center gap-2">
        <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 shrink-0" />
        <span class="font-display text-lg font-bold tracking-wide text-brand-primary">INBOX</span>
      </div>
    </div>
    <button
      v-if="!user"
      type="button"
      class="canva-home-login shrink-0"
      @click="openGate({ smsLive })"
    >
      {{ t('auth.loginRegister') }}
    </button>
    <NuxtLink
      v-else
      :to="dashboardPathForRole(user.role)"
      class="canva-home-login canva-home-login-soft shrink-0"
    >
      {{ t('home.welcome', { name: firstNameOrGuest }) }}
    </NuxtLink>
  </header>
</template>
