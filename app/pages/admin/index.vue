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
  payments: {
    count: number
    totalAmount: number
    paidCount: number
    paidAmount: number
    paidIpgCount: number
    paidIpgAmount: number
    paidOnSiteCount: number
    paidOnSiteAmount: number
    pendingCount: number
  }
  applications: { pending: number }
  tickets?: { open: number }
  withdrawals?: { pending: number }
}

const data = ref<Overview | null>(null)
const pending = ref(false)
const loadError = ref('')

async function load() {
  if (!secret.value) return
  pending.value = true
  try {
    data.value = await adminFetch<Overview>('/api/admin/overview')
    loadError.value = ''
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
    <section class="admin-overview-hero">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0 flex-1 text-start">
          <p class="text-xs text-white/80">{{ t('admin.consoleTitle') }}</p>
          <h1 class="mt-1 text-2xl font-bold text-white">{{ t('admin.overviewTitle') }}</h1>
          <p class="mt-1 text-sm text-white/85">{{ t('admin.overviewSubtitle') }}</p>
        </div>
        <button
          v-if="loadError"
          type="button"
          class="shrink-0 bg-white px-3 py-2 text-xs font-bold text-brand-primary transition hover:brightness-95 disabled:opacity-60"
          style="border-radius: 2px;"
          :disabled="pending"
          @click="load"
        >
          {{ pending ? t('common.loading') : t('common.retry') }}
        </button>
      </div>
    </section>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="stat-grid">
      <div v-if="data" class="space-y-6">
        <div class="tail-card-grid-3">
          <AppTailStatCard :label="t('admin.metrics.clubs')" :value="formatNumber(data.clubs.total)" icon="stadium" />
          <AppTailStatCard :label="t('admin.metrics.users')" :value="formatNumber(data.users.total)" icon="group" />
          <AppTailStatCard :label="t('admin.metrics.bookings')" :value="formatNumber(data.bookings.total)" icon="event" />
        </div>
        <div class="tail-card-grid-2">
          <AppTailStatCard :label="t('admin.paymentChannelIpg')" :value="formatCurrency(data.payments.paidIpgAmount)" icon="payments" />
          <AppTailStatCard :label="t('admin.paymentChannelOnSite')" :value="formatCurrency(data.payments.paidOnSiteAmount)" icon="payments" />
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
                <NuxtLink :to="localePath('/admin/tickets')" class="underline">{{ t('admin.metrics.openTickets') }}</NuxtLink>
                <strong dir="ltr">{{ formatNumber(data.tickets?.open || 0) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <NuxtLink :to="localePath('/admin/withdrawals')" class="underline">{{ t('admin.metrics.pendingWithdrawals') }}</NuxtLink>
                <strong dir="ltr">{{ formatNumber(data.withdrawals?.pending || 0) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <NuxtLink :to="localePath('/admin/applications')" class="underline">{{ t('admin.metrics.pendingApplications') }}</NuxtLink>
                <strong dir="ltr">{{ formatNumber(data.applications.pending) }}</strong>
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
          </div>
        </div>
      </div>
    </AppAsyncState>
  </div>
</template>

<style scoped>
.admin-overview-hero {
  @apply relative overflow-hidden bg-brand-primary p-5 text-white;
  border-radius: 2px;
  background-image:
    radial-gradient(ellipse at top left, rgba(255, 255, 255, 0.16), transparent 42%),
    radial-gradient(ellipse at bottom right, rgba(0, 0, 0, 0.12), transparent 48%),
    url('/brand/canva-auth-pattern.svg');
  background-size: auto, auto, 160px 160px;
  background-blend-mode: normal, normal, soft-light;
}
</style>
