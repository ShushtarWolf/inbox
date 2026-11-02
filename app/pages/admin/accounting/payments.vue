<script setup lang="ts">
import type { AccountingPaymentBucket } from '#shared/bookingPayment.ts'
import { isAccountingPaymentBucket } from '#shared/bookingPayment.ts'

definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatCurrency, formatDate, formatNumber, formatTimeLabel, formatPhone } = useFormatters()

type PaymentRow = {
  id: string
  amount: number
  method: string
  status: string
  provider: string
  createdAt: string
  bookingId: string | null
  club: { id: string; nameFa: string; slug: string } | null
  user: { id: string; email: string; name: string } | null
  guestName: string | null
  guestMobile: string | null
  bookingStatus: string | null
  courtNameFa: string | null
  date: string | null
  startTime: string | null
}

type Payload = {
  bucket: AccountingPaymentBucket
  range: { from: string | null; to: string | null }
  total: number
  limit: number
  payments: PaymentRow[]
}

const bucket = computed(() => {
  const raw = route.query.bucket
  return typeof raw === 'string' && isAccountingPaymentBucket(raw) ? raw : null
})

const fromDate = computed(() => (typeof route.query.from === 'string' ? route.query.from : ''))
const toDate = computed(() => (typeof route.query.to === 'string' ? route.query.to : ''))

const data = ref<Payload | null>(null)
const pending = ref(false)
const loadError = ref('')
const expandedId = ref<string | null>(null)

const backLink = computed(() => {
  const params = new URLSearchParams()
  if (fromDate.value) params.set('from', fromDate.value)
  if (toDate.value) params.set('to', toDate.value)
  const qs = params.toString()
  return localePath(`/admin/accounting${qs ? `?${qs}` : ''}`)
})

const rangeLabel = computed(() => {
  if (fromDate.value && toDate.value) {
    return t('admin.accounting.rangeFromTo', { from: fromDate.value, to: toDate.value })
  }
  if (fromDate.value) {
    return t('admin.accounting.rangeFromTo', { from: fromDate.value, to: '…' })
  }
  if (toDate.value) {
    return t('admin.accounting.rangeFromTo', { from: '…', to: toDate.value })
  }
  return t('admin.accounting.rangeAllTime')
})

function bucketTitle(b: AccountingPaymentBucket) {
  return t(`admin.accounting.bucket.${b}`)
}

function contactName(row: PaymentRow) {
  return row.user?.name || row.guestName || '—'
}

function contactLine(row: PaymentRow) {
  if (row.user?.email) return row.user.email
  return row.guestMobile ? formatPhone(row.guestMobile) : '—'
}

function methodLabel(method: string) {
  if (method === 'IPG') return t('admin.accounting.bucket.IPG')
  if (method === 'CASH') return t('admin.accounting.bucket.ON_SITE')
  if (method === 'PAID') return t('admin.accounting.bucket.WALLET')
  return method
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

async function load() {
  if (!secret.value || !bucket.value) return
  pending.value = true
  loadError.value = ''
  expandedId.value = null
  try {
    const params = new URLSearchParams({ bucket: bucket.value, limit: '200' })
    if (fromDate.value) params.set('from', fromDate.value)
    if (toDate.value) params.set('to', toDate.value)
    data.value = await adminFetch<Payload>(`/api/admin/accounting/payments?${params}`)
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      loadError.value = t('admin.invalidSecret')
      clearSecret()
    } else if (status === 400) {
      loadError.value = t('common.error')
    } else {
      loadError.value = t('common.error')
    }
  } finally {
    pending.value = false
  }
}

watch([secret, bucket, fromDate, toDate], () => {
  if (secret.value && bucket.value) load()
}, { immediate: true })
</script>

<template>
  <div class="tail-page-stack">
    <section class="admin-overview-hero">
      <NuxtLink :to="backLink" class="text-xs font-bold text-white/90 underline hover:text-white">
        {{ t('admin.accounting.backToAccounting') }}
      </NuxtLink>
      <h1 class="mt-2 text-2xl font-bold text-white">{{ t('admin.accounting.paymentsDetailTitle') }}</h1>
      <p v-if="bucket" class="mt-1 text-sm text-white/85">
        {{ bucketTitle(bucket) }} · {{ rangeLabel }}
      </p>
      <p v-else class="mt-1 text-sm text-white/85">{{ t('common.error') }}</p>
    </section>

    <AppAsyncState
      :pending="pending"
      :error="loadError ? new Error(loadError) : null"
      skeleton-variant="table"
    >
      <div v-if="!bucket" class="ios-card p-6 text-sm text-brand-gray-600">
        {{ t('common.error') }}
      </div>
      <template v-else-if="data">
        <p class="text-sm text-brand-gray-600">
          {{ t('admin.accounting.paymentsDetailSubtitle') }}
          <span v-if="data.total > data.payments.length" class="text-brand-gray-500">
            — {{ t('admin.accounting.showingLimited', {
              shown: formatNumber(data.payments.length),
              total: formatNumber(data.total),
            }) }}
          </span>
        </p>

        <div v-if="data.payments.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
          {{ t('common.empty') }}
        </div>
        <div v-else class="overflow-x-auto ios-card">
          <table class="w-full min-w-[820px] text-sm">
            <thead>
              <tr class="border-b border-brand-gray-100 text-start">
                <th class="p-3 font-bold">{{ t('common.date') }}</th>
                <th class="p-3 font-bold">{{ t('admin.clubName') }}</th>
                <th class="p-3 font-bold">{{ t('admin.contact') }}</th>
                <th class="p-3 font-bold">{{ t('admin.amount') }}</th>
                <th class="p-3 font-bold">{{ t('admin.accounting.colMethod') }}</th>
                <th class="p-3 font-bold" />
              </tr>
            </thead>
            <tbody>
              <template v-for="row in data.payments" :key="row.id">
                <tr class="border-b border-brand-gray-50">
                  <td class="p-3 tabular-nums whitespace-nowrap" dir="ltr">{{ formatDate(row.createdAt) }}</td>
                  <td class="p-3">
                    <NuxtLink
                      v-if="row.club"
                      :to="localePath(`/admin/clubs/${row.club.id}`)"
                      class="font-bold text-brand-navy underline"
                    >
                      {{ row.club.nameFa }}
                    </NuxtLink>
                    <span v-else>—</span>
                    <div v-if="row.courtNameFa" class="text-xs text-brand-gray-600">{{ row.courtNameFa }}</div>
                  </td>
                  <td class="p-3">
                    <div>{{ contactName(row) }}</div>
                    <div class="text-xs text-brand-gray-600" dir="ltr">{{ contactLine(row) }}</div>
                  </td>
                  <td class="p-3 tabular-nums" dir="ltr">{{ formatCurrency(row.amount) }}</td>
                  <td class="p-3">{{ methodLabel(row.method) }}</td>
                  <td class="p-3 whitespace-nowrap">
                    <button
                      type="button"
                      class="border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40"
                      style="border-radius: 0;"
                      @click="toggleExpand(row.id)"
                    >
                      {{ expandedId === row.id ? t('admin.hideDetail') : t('admin.showDetail') }}
                    </button>
                  </td>
                </tr>
                <tr v-if="expandedId === row.id" class="border-b border-brand-gray-50 bg-brand-gray-50/60">
                  <td colspan="6" class="p-3 text-xs text-brand-gray-700">
                    <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <li class="flex justify-between gap-2">
                        <span>{{ t('admin.accounting.colPaymentId') }}</span>
                        <span dir="ltr">{{ row.id }}</span>
                      </li>
                      <li v-if="row.bookingId" class="flex justify-between gap-2">
                        <span>{{ t('admin.bookingId') }}</span>
                        <span dir="ltr">{{ row.bookingId }}</span>
                      </li>
                      <li class="flex justify-between gap-2">
                        <span>{{ t('admin.provider') }}</span>
                        <span dir="ltr">{{ row.provider }}</span>
                      </li>
                      <li v-if="row.date" class="flex justify-between gap-2">
                        <span>{{ t('common.date') }}</span>
                        <span dir="ltr">{{ formatDate(row.date) }} {{ formatTimeLabel(row.startTime) }}</span>
                      </li>
                    </ul>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>
    </AppAsyncState>
  </div>
</template>

<style scoped>
.admin-overview-hero {
  @apply relative mb-6 overflow-hidden p-[22px] text-white min-[431px]:px-7;
  border-radius: 0;
  background: linear-gradient(135deg, #c41e1e, #b01818);
}
</style>
