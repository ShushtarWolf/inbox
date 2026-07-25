<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { secret, secretRejected, setSecret, lockSecret, adminFetch } = useAdminSecret()

useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const secretInput = ref('')
const authError = ref('')
const verifying = ref(false)

const nav = computed(() => [
  { to: localePath('/admin'), label: t('admin.nav.overview'), icon: 'dashboard' },
  { to: localePath('/admin/clubs'), label: t('admin.nav.clubs'), icon: 'stadium' },
  { to: localePath('/admin/users'), label: t('admin.nav.users'), icon: 'group' },
  { to: localePath('/admin/bookings'), label: t('admin.nav.bookings'), icon: 'event' },
  { to: localePath('/admin/applications'), label: t('admin.nav.applications'), icon: 'assignment' },
  { to: localePath('/admin/sms'), label: t('admin.nav.sms'), icon: 'sms' },
  { to: localePath('/admin/sentry'), label: t('admin.nav.sentry'), icon: 'monitoring' },
  { to: localePath('/admin/provision'), label: t('admin.nav.provision'), icon: 'person_add' },
])

const gateMessage = computed(() => {
  if (authError.value) return authError.value
  if (secretRejected.value) return t('admin.invalidSecret')
  return ''
})

async function submitSecret() {
  authError.value = ''
  if (!secretInput.value.trim()) {
    authError.value = t('admin.secretRequired')
    return
  }
  verifying.value = true
  try {
    setSecret(secretInput.value)
    // Verify before unlocking the shell — invalid secret must clear + show gate error.
    await adminFetch('/api/admin/overview')
    secretInput.value = ''
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status !== 403) {
      authError.value = status === 503
        ? t('admin.secretNotConfigured')
        : t('common.error')
      lockSecret()
    }
    // 403: adminFetch already rejectSecret()'d — gateMessage shows invalidSecret
  } finally {
    verifying.value = false
  }
}

function lockAdmin() {
  lockSecret()
  secretInput.value = ''
  authError.value = ''
}
</script>

<template>
  <div v-if="!secret" class="mx-auto min-h-screen max-w-md p-4 pt-12">
    <div class="mb-6 text-center">
      <p class="text-xs font-medium uppercase tracking-wider text-brand-gray-500">inbox</p>
      <h1 class="mt-1 font-display text-xl font-bold text-brand-navy">{{ t('admin.consoleTitle') }}</h1>
      <p class="mt-2 text-sm text-brand-gray-600">{{ t('admin.secretPrompt') }}</p>
      <p class="mt-1 text-xs text-brand-gray-500">{{ t('admin.secretHint') }}</p>
    </div>
    <div class="border border-brand-gray-200 bg-white p-6 venus-form-stack" style="border-radius: 2px;">
      <AppFormField :label="t('admin.secretLabel')">
        <input
          v-model="secretInput"
          type="password"
          class="neo-input"
          dir="ltr"
          autocomplete="current-password"
          :disabled="verifying"
          @keyup.enter="submitSecret"
        />
      </AppFormField>
      <p v-if="gateMessage" class="venus-alert-error">{{ gateMessage }}</p>
      <button type="button" class="btn-primary w-full" :disabled="verifying" @click="submitSecret">
        {{ verifying ? t('common.loading') : t('admin.enter') }}
      </button>
    </div>
  </div>
  <DashboardShell
    v-else
    :title="t('admin.consoleTitle')"
    :items="nav"
    :wide="true"
    :dark-nav="true"
    :hide-user="true"
    :logout-label="t('admin.logout')"
    :custom-logout="lockAdmin"
  >
    <slot />
  </DashboardShell>
</template>
