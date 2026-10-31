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
    manualRefundsOwed?: number
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
      <div v-if="data" class="admin-overview-body space-y-5">
        <div class="admin-a3">
          <div class="admin-astat">
            <span class="admin-astat-icon"><AppIcon name="stadium" size="sm" /></span>
            <div>
              <small>{{ t('admin.metrics.clubs') }}</small>
              <b dir="ltr" class="tabular-nums">{{ formatNumber(data.clubs.total) }}</b>
            </div>
          </div>
          <div class="admin-astat">
            <span class="admin-astat-icon"><AppIcon name="group" size="sm" /></span>
            <div>
              <small>{{ t('admin.metrics.users') }}</small>
              <b dir="ltr" class="tabular-nums">{{ formatNumber(data.users.total) }}</b>
            </div>
          </div>
          <div class="admin-astat">
            <span class="admin-astat-icon"><AppIcon name="event" size="sm" /></span>
            <div>
              <small>{{ t('admin.metrics.bookings') }}</small>
              <b dir="ltr" class="tabular-nums">{{ formatNumber(data.bookings.total) }}</b>
            </div>
          </div>
        </div>

        <div class="admin-a2">
          <div class="admin-astat">
            <span class="admin-astat-icon"><AppIcon name="payments" size="sm" /></span>
            <div>
              <small>{{ t('admin.paymentChannelIpg') }}</small>
              <b dir="ltr" class="tabular-nums">{{ formatCurrency(data.payments.paidIpgAmount) }}</b>
            </div>
          </div>
          <div class="admin-astat">
            <span class="admin-astat-icon"><AppIcon name="payments" size="sm" /></span>
            <div>
              <small>{{ t('admin.paymentChannelOnSite') }}</small>
              <b dir="ltr" class="tabular-nums">{{ formatCurrency(data.payments.paidOnSiteAmount) }}</b>
            </div>
          </div>
        </div>

        <div class="admin-a3">
          <div class="admin-acard">
            <h3>{{ t('admin.nav.clubs') }}</h3>
            <div class="admin-akv"><span>{{ t('admin.clubStatus.active') }}</span><b dir="ltr">{{ formatNumber(data.clubs.active) }}</b></div>
            <div class="admin-akv"><span>{{ t('admin.clubStatus.pending') }}</span><b dir="ltr">{{ formatNumber(data.clubs.pending) }}</b></div>
            <div class="admin-akv"><span>{{ t('admin.clubStatus.suspended') }}</span><b dir="ltr">{{ formatNumber(data.clubs.suspended) }}</b></div>
            <NuxtLink :to="localePath('/admin/clubs')" class="admin-alink">{{ t('admin.viewAll') }}</NuxtLink>
          </div>
          <div class="admin-acard">
            <h3>{{ t('admin.nav.users') }}</h3>
            <div class="admin-akv"><span>{{ t('admin.roles.CLUB_ADMIN') }}</span><b dir="ltr">{{ formatNumber(data.users.clubAdmin) }}</b></div>
            <div class="admin-akv"><span>{{ t('admin.roles.ATHLETE') }}</span><b dir="ltr">{{ formatNumber(data.users.athlete) }}</b></div>
            <div class="admin-akv"><span>{{ t('admin.roles.COACH') }}</span><b dir="ltr">{{ formatNumber(data.users.coach) }}</b></div>
            <div class="admin-akv"><span>{{ t('admin.userDisabled') }}</span><b dir="ltr">{{ formatNumber(data.users.disabled) }}</b></div>
            <NuxtLink :to="localePath('/admin/users')" class="admin-alink">{{ t('admin.viewAll') }}</NuxtLink>
          </div>
          <div class="admin-acard">
            <h3>{{ t('admin.attention') }}</h3>
            <div class="admin-akv">
              <NuxtLink :to="localePath('/admin/tickets')" class="admin-alink">{{ t('admin.metrics.openTickets') }}</NuxtLink>
              <b dir="ltr">{{ formatNumber(data.tickets?.open || 0) }}</b>
            </div>
            <div class="admin-akv">
              <NuxtLink :to="localePath('/admin/withdrawals')" class="admin-alink">{{ t('admin.metrics.pendingWithdrawals') }}</NuxtLink>
              <b dir="ltr">{{ formatNumber(data.withdrawals?.pending || 0) }}</b>
            </div>
            <div class="admin-akv">
              <NuxtLink :to="localePath('/admin/applications')" class="admin-alink">{{ t('admin.metrics.pendingApplications') }}</NuxtLink>
              <b dir="ltr">{{ formatNumber(data.applications.pending) }}</b>
            </div>
            <div class="admin-akv"><span>{{ t('admin.metrics.bookingsToday') }}</span><b dir="ltr">{{ formatNumber(data.bookings.today) }}</b></div>
            <div class="admin-akv"><span>{{ t('admin.metrics.pendingPayments') }}</span><b dir="ltr">{{ formatNumber(data.payments.pendingCount) }}</b></div>
            <div class="admin-akv">
              <span>{{ t('admin.metrics.manualRefundsOwed') }}</span>
              <b dir="ltr" :class="(data.payments.manualRefundsOwed || 0) > 0 ? 'text-red-600' : ''">{{ formatNumber(data.payments.manualRefundsOwed || 0) }}</b>
            </div>
          </div>
        </div>
      </div>
    </AppAsyncState>
  </div>
</template>

<style scoped>
/* HTML .rred.sm — crimson gradient hero, square */
.admin-overview-hero {
  @apply relative mb-6 overflow-hidden p-[22px] text-white min-[431px]:px-7;
  border-radius: 0;
  background: linear-gradient(135deg, #c41e1e, #b01818);
}
</style>
