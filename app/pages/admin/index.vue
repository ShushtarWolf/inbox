<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatCurrency, formatNumber } = useFormatters()

type Overview = {
  clubs: { total: number; active: number; pending: number; suspended: number }
  users: { total: number; athlete: number; coach: number; clubAdmin: number; disabled: number }
  bookings: { total: number; confirmed: number; cancelled: number; pending: number; today: number }
  payments: { count: number; totalAmount: number; paidCount: number; paidAmount: number; pendingCount: number }
  applications: { pending: number }
  bugReports: { open: number }
}

const data = ref<Overview | null>(null)
const pending = ref(false)
const loadError = ref('')

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    data.value = await adminFetch<Overview>('/api/admin/overview')
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      loadError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      loadError.value = t('common.error')
    }
  } finally {
    pending.value = false
  }
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })
</script>

<template>
  <div class="tail-page-stack">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="tail-page-title">{{ t('admin.overviewTitle') }}</h1>
        <p class="mt-1 text-sm text-brand-gray-600">{{ t('admin.overviewSubtitle') }}</p>
      </div>
      <button type="button" class="btn-secondary text-xs" :disabled="pending" @click="load">
        {{ t('common.retry') }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="stat-grid">
      <div v-if="data" class="space-y-6">
        <div class="tail-card-grid-4">
          <AppTailStatCard :label="t('admin.metrics.clubs')" :value="formatNumber(data.clubs.total)" icon="stadium" />
          <AppTailStatCard :label="t('admin.metrics.users')" :value="formatNumber(data.users.total)" icon="group" />
          <AppTailStatCard :label="t('admin.metrics.bookings')" :value="formatNumber(data.bookings.total)" icon="event" />
          <AppTailStatCard :label="t('admin.metrics.paidRevenue')" :value="formatCurrency(data.payments.paidAmount)" icon="payments" />
        </div>

        <div class="tail-card-grid-3">
          <div class="tail-card">
            <h2 class="tail-section-title mb-3">{{ t('admin.nav.clubs') }}</h2>
            <ul class="space-y-2 text-sm">
              <li class="flex justify-between gap-2"><span>{{ t('admin.clubStatus.active') }}</span><strong dir="ltr">{{ formatNumber(data.clubs.active) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.clubStatus.pending') }}</span><strong dir="ltr">{{ formatNumber(data.clubs.pending) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.clubStatus.suspended') }}</span><strong dir="ltr">{{ formatNumber(data.clubs.suspended) }}</strong></li>
            </ul>
            <NuxtLink :to="localePath('/admin/clubs')" class="mt-4 inline-block text-sm font-bold text-brand-navy underline">
              {{ t('admin.viewAll') }}
            </NuxtLink>
          </div>
          <div class="tail-card">
            <h2 class="tail-section-title mb-3">{{ t('admin.nav.users') }}</h2>
            <ul class="space-y-2 text-sm">
              <li class="flex justify-between gap-2"><span>{{ t('admin.roles.CLUB_ADMIN') }}</span><strong dir="ltr">{{ formatNumber(data.users.clubAdmin) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.roles.ATHLETE') }}</span><strong dir="ltr">{{ formatNumber(data.users.athlete) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.roles.COACH') }}</span><strong dir="ltr">{{ formatNumber(data.users.coach) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.userDisabled') }}</span><strong dir="ltr">{{ formatNumber(data.users.disabled) }}</strong></li>
            </ul>
            <NuxtLink :to="localePath('/admin/users')" class="mt-4 inline-block text-sm font-bold text-brand-navy underline">
              {{ t('admin.viewAll') }}
            </NuxtLink>
          </div>
          <div class="tail-card">
            <h2 class="tail-section-title mb-3">{{ t('admin.attention') }}</h2>
            <ul class="space-y-2 text-sm">
              <li class="flex justify-between gap-2">
                <NuxtLink :to="localePath('/admin/applications')" class="underline">{{ t('admin.metrics.pendingApplications') }}</NuxtLink>
                <strong dir="ltr">{{ formatNumber(data.applications.pending) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <NuxtLink :to="localePath('/admin/bug-reports')" class="underline">{{ t('admin.metrics.openBugs') }}</NuxtLink>
                <strong dir="ltr">{{ formatNumber(data.bugReports.open) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.metrics.bookingsToday') }}</span>
                <strong dir="ltr">{{ formatNumber(data.bookings.today) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.metrics.pendingPayments') }}</span>
                <strong dir="ltr">{{ formatNumber(data.payments.pendingCount) }}</strong>
              </li>
            </ul>
            <NuxtLink :to="localePath('/admin/provision')" class="mt-4 inline-block text-sm font-bold text-brand-navy underline">
              {{ t('admin.nav.provision') }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </AppAsyncState>
  </div>
</template>
