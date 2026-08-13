<script setup lang="ts">
/** Admin unlock gate — secret-header console (NO CANVA phone frame). Clean FA ops UI. */
const { t } = useI18n()
const localePath = useLocalePath()
const { secret, secretRejected, setSecret, lockSecret, adminFetch } = useAdminSecret()

useHead({
  title: () => t('admin.consoleTitle'),
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
  { to: localePath('/admin/withdrawals'), label: t('admin.nav.withdrawals'), icon: 'account_balance' },
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
  <div
    v-if="!secret"
    class="flex min-h-dvh flex-col bg-brand-gray-50"
  >
    <div class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <!-- Brand → home -->
      <NuxtLink
        :to="localePath('/')"
        class="mb-6 flex items-center justify-center gap-2"
        :aria-label="t('brand.name')"
      >
        <img src="/brand/inbox-logo-mark.svg" alt="" class="h-8 w-8" />
        <InboxWordmark class="text-lg text-brand-navy" />
      </NuxtLink>

      <!-- Title + ops card -->
      <div
        class="border border-brand-gray-200 bg-white p-5 shadow-sm"
        style="border-radius: 2px;"
      >
        <h1 class="text-start text-lg font-bold text-brand-navy">{{ t('admin.consoleTitle') }}</h1>
        <p class="mt-1 text-start text-sm text-brand-gray-600">{{ t('admin.secretPrompt') }}</p>

        <form class="mt-5 space-y-3" @submit.prevent="submitSecret">
          <AppFormField field-id="admin-secret" :label="t('admin.secretLabel')">
            <input
              id="admin-secret"
              v-model="secretInput"
              type="password"
              class="neo-input"
              style="border-radius: 2px;"
              dir="ltr"
              autocomplete="current-password"
              :disabled="verifying"
            />
          </AppFormField>

          <p v-if="gateMessage" class="venus-alert-error text-start" role="alert">{{ gateMessage }}</p>

          <button
            type="submit"
            class="inline-flex w-full items-center justify-center bg-brand-primary px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-brand-gray-300 disabled:text-brand-gray-600"
            style="border-radius: 2px;"
            :disabled="verifying"
          >
            {{ verifying ? t('common.loading') : t('admin.enter') }}
          </button>
        </form>

        <p class="mt-4 text-start text-xs leading-relaxed text-brand-gray-500">
          {{ t('admin.secretHint') }}
        </p>
      </div>
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
