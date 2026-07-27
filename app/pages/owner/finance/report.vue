<script setup lang="ts">
import { hasOwnerPermission, parsePermissions } from '#shared/ownerPermissions.ts'
import { isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const { user } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/finance')
useOwnerClubRefresh(refresh)
const { formatCurrency, formatNumber } = useFormatters()

const activeMembership = computed(() => {
  const memberships = user.value?.memberships || []
  return memberships.find((item) => item.club.id === selectedClubId.value) || memberships[0]
})
const permissions = computed(() => parsePermissions(activeMembership.value?.permissionsJson))
const isOwner = computed(() => activeMembership.value?.role === 'OWNER')
const canReports = computed(() => isOwner.value || hasOwnerPermission(permissions.value, 'finance:reports'))

function bookingStatusLabel(status: string) {
  return t(`booking.status.${status}`)
}

function paymentStatusLabel(status: string) {
  return t(`booking.paymentStatus.${status}`)
}

function isTxUnpaid(tx: { unpaid?: boolean; paymentStatus?: string; bookingStatus?: string }) {
  if (typeof tx.unpaid === 'boolean') return tx.unpaid
  return tx.bookingStatus !== 'CANCELLED' && isUnpaidPaymentStatus(tx.paymentStatus)
}

function downloadReport() {
  if (!import.meta.client || !data.value) return
  const rows = [
    ['metric', 'value'],
    ['revenue', String(data.value.stats?.revenue || 0)],
    ['unpaid', String(data.value.stats?.unpaid || 0)],
    ['paidRate', String(data.value.stats?.paidRate || 0)],
    ['utilization', String(data.value.stats?.utilization || 0)],
    ['ltv', String(data.value.stats?.ltv || 0)],
    ['churnRisk', String(data.value.stats?.churnRisk || 0)],
    ['noShowRate', String(data.value.stats?.noShowRate || 0)],
  ]
  const csv = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'inbox-finance-report.csv'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/owner/finance" :title="t('owner.financePage.advancedReport')" />

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="stat-grid">
      <CanvaEmptyState v-if="!canReports" :title="t('owner.financePage.reportsLocked')" icon="lock" />

      <template v-else>
        <section>
          <h2 class="mb-2 text-start text-sm font-bold text-brand-navy">{{ t('owner.financePage.customerSignals') }}</h2>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="canva-panel text-center !p-3">
              <p class="text-[10px] font-bold text-brand-gray-500">{{ t('owner.financeCards.unpaid') }}</p>
              <p class="mt-1 text-xl font-bold text-brand-navy">{{ formatNumber(data?.stats?.unpaid || 0) }}</p>
            </div>
            <div class="canva-panel text-center !p-3">
              <p class="text-[10px] font-bold text-brand-gray-500">{{ t('owner.financeCards.paidRate') }}</p>
              <p class="mt-1 text-xl font-bold text-brand-navy">{{ formatNumber(data?.stats?.paidRate || 0) }}%</p>
            </div>
            <div class="canva-panel text-center !p-3">
              <p class="text-[10px] font-bold text-brand-gray-500">{{ t('owner.financeCards.utilization') }}</p>
              <p class="mt-1 text-xl font-bold text-brand-navy">{{ formatNumber(data?.stats?.utilization || 0) }}%</p>
            </div>
            <div class="canva-panel text-center !p-3">
              <p class="text-[10px] font-bold text-brand-gray-500">{{ t('owner.financeCards.noShowRate') }}</p>
              <p class="mt-1 text-xl font-bold text-brand-navy">{{ formatNumber(data?.stats?.noShowRate || 0) }}%</p>
            </div>
          </div>
        </section>

        <section>
          <h2 class="mb-2 text-start text-sm font-bold text-brand-navy">{{ t('owner.financePage.ltvTitle') }}</h2>
          <div class="grid grid-cols-2 gap-2">
            <div class="canva-panel !p-3">
              <p class="text-[10px] font-bold text-brand-gray-500">{{ t('owner.financeCards.churnRisk') }}</p>
              <p class="mt-1 text-xl font-bold text-brand-navy">{{ formatNumber(data?.stats?.churnRisk || 0) }}%</p>
            </div>
            <div class="canva-panel !p-3">
              <p class="text-[10px] font-bold text-brand-gray-500">{{ t('owner.financeCards.ltv') }}</p>
              <p class="mt-1 text-lg font-bold text-brand-navy">{{ formatCurrency(data?.stats?.ltv || 0) }}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 class="mb-2 text-start text-sm font-bold text-brand-navy">{{ t('owner.financePage.funnelTitle') }}</h2>
          <div class="canva-panel flex min-h-[7rem] items-center justify-center text-center text-xs text-brand-gray-500">
            <div>
              <p>{{ t('owner.financePage.funnelPlaceholder') }}</p>
              <p class="mt-2 font-bold text-brand-navy">
                {{ formatNumber(data?.funnel?.confirmed || 0) }} / {{ formatNumber(data?.funnel?.total || 0) }}
              </p>
            </div>
          </div>
        </section>

        <button type="button" class="canva-black-cta" @click="downloadReport">
          {{ t('owner.financePage.downloadReport') }}
        </button>

        <div class="canva-panel space-y-3">
          <h2 class="text-base font-bold text-brand-navy">{{ t('owner.financeTable.reservation') }}</h2>
          <CanvaEmptyState v-if="!(data?.transactions?.length)" :title="t('common.empty')" icon="receipt_long" />
          <div v-else class="space-y-2">
            <div
              v-for="tx in data?.transactions"
              :key="tx.id"
              class="canva-list-card"
              :class="isTxUnpaid(tx) ? 'border-amber-200 bg-amber-50/60' : ''"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0 text-start">
                  <p class="font-bold text-brand-navy">{{ t(`owner.financeTable.kind.${tx.kind}`) }} · {{ tx.reservationLabel }}</p>
                  <p class="mt-0.5 text-sm text-brand-gray-600">{{ tx.guestName }}</p>
                  <p class="mt-1 text-xs text-brand-gray-500">
                    {{ paymentStatusLabel(tx.paymentStatus) }} · {{ bookingStatusLabel(tx.bookingStatus) }}
                  </p>
                </div>
                <p class="font-bold" :class="isTxUnpaid(tx) ? 'text-amber-700' : 'text-brand-primary'">{{ formatCurrency(tx.amount) }}</p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </AppAsyncState>
  </div>
</template>
