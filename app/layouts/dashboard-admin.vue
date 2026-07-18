<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { secret, setSecret, clearSecret } = useAdminSecret()

useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const secretInput = ref('')
const authError = ref('')

const nav = computed(() => [
  { to: localePath('/admin'), label: t('admin.nav.overview'), icon: 'dashboard' },
  { to: localePath('/admin/clubs'), label: t('admin.nav.clubs'), icon: 'stadium' },
  { to: localePath('/admin/users'), label: t('admin.nav.users'), icon: 'group' },
  { to: localePath('/admin/bookings'), label: t('admin.nav.bookings'), icon: 'event' },
  { to: localePath('/admin/applications'), label: t('admin.nav.applications'), icon: 'assignment' },
  { to: localePath('/admin/bug-reports'), label: t('admin.nav.bugReports'), icon: 'bug_report' },
  { to: localePath('/admin/sms'), label: t('admin.nav.sms'), icon: 'sms' },
  { to: localePath('/admin/sentry'), label: t('admin.nav.sentry'), icon: 'monitoring' },
  { to: localePath('/admin/provision'), label: t('admin.nav.provision'), icon: 'person_add' },
])

function submitSecret() {
  authError.value = ''
  if (!secretInput.value.trim()) {
    authError.value = t('admin.secretRequired')
    return
  }
  setSecret(secretInput.value)
}

function lockAdmin() {
  clearSecret()
  secretInput.value = ''
}
</script>

<template>
  <div v-if="!secret" class="mx-auto min-h-screen max-w-sm p-4 pt-12">
    <div class="mb-6 text-center">
      <p class="text-xs font-medium uppercase tracking-wider text-brand-gray-500">inbox</p>
      <h1 class="mt-1 font-display text-xl font-bold">{{ t('admin.consoleTitle') }}</h1>
      <p class="mt-2 text-sm text-brand-gray-600">{{ t('admin.secretPrompt') }}</p>
      <p class="mt-1 text-xs text-brand-gray-500">{{ t('admin.secretHint') }}</p>
    </div>
    <div class="ios-card p-6 venus-form-stack">
      <AppFormField :label="t('admin.secretLabel')">
        <input
          v-model="secretInput"
          type="password"
          class="neo-input"
          dir="ltr"
          autocomplete="current-password"
          @keyup.enter="submitSecret"
        />
      </AppFormField>
      <p v-if="authError" class="venus-alert-error">{{ authError }}</p>
      <button type="button" class="btn-primary w-full" @click="submitSecret">{{ t('admin.enter') }}</button>
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
