<script setup lang="ts">
/**
 * Shared public phone chrome: inboxs logo (always → home) + login / signed-in shortcut.
 * Optional backTo keeps funnel pages escapable without relying only on bottom nav.
 */
const props = defineProps<{
  /** Locale path or path+query for back (e.g. `/clubs` or `/clubs/foo`). */
  backTo?: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { user, fetch: fetchAuth, firstName } = useAuth()
const { openGate } = useAuthFlow()
const { smsLive } = useSmsCapability()
const { activeRole, canSwitchRole, signedInHomePath } = usePlatformRoles()

const firstNameOrGuest = computed(() => firstName.value || t('home.guestName'))

const activeRoleLabel = computed(() => {
  const role = activeRole.value
  if (!role) return ''
  return t(`admin.roles.${role}`)
})

const welcomeLabel = computed(() => {
  if (activeRoleLabel.value) {
    return t('home.welcomeWithRole', { name: firstNameOrGuest.value, role: activeRoleLabel.value })
  }
  return t('home.welcome', { name: firstNameOrGuest.value })
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
      <NuxtLink
        :to="localePath('/')"
        class="flex min-w-0 items-center gap-2"
        :aria-label="t('brand.name')"
      >
        <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 shrink-0" />
        <InboxWordmark class="text-lg text-brand-primary" />
      </NuxtLink>
    </div>
    <button
      v-if="!user"
      type="button"
      class="canva-home-login shrink-0"
      @click="openGate({ smsLive })"
    >
      {{ t('auth.loginRegister') }}
    </button>
    <div v-else class="flex max-w-[58%] shrink-0 flex-col items-stretch gap-1">
      <NuxtLink
        :to="signedInHomePath"
        class="canva-home-login canva-home-login-soft max-w-full truncate text-center"
      >
        {{ welcomeLabel }}
      </NuxtLink>
      <NuxtLink
        v-if="canSwitchRole"
        :to="localePath('/choose-role')"
        class="text-center text-[11px] font-semibold text-brand-primary"
      >
        {{ t('auth.changeRole') }}
      </NuxtLink>
    </div>
  </header>
</template>
