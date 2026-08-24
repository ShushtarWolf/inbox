<script setup lang="ts">
import { isPaymentChannel, resolvePaymentChannel } from '#shared/bookingPayment.ts'

definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatCurrency, formatDate, formatTimeLabel } = useFormatters()

const PAYMENT_FILTERS = ['ALL', 'IPG', 'ON_SITE', 'PENDING_ONLINE', 'FAILED', 'REFUNDED'] as const
type PaymentFilter = (typeof PAYMENT_FILTERS)[number]

type BookingRow = {
  id: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  paymentStatus: string
  paymentMethod: string | null
  source: string
  createdAt: string
  guestName: string | null
  guestMobile: string | null
  user: { id: string; email: string; name: string } | null
  payment: { id: string; amount: number; status: string; method: string } | null
  club: { id: string; nameFa: string; nameEn: string; slug: string; city: string }
  courtNameFa: string
  date: string
  startTime: string
}

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

const tab = ref<'bookings' | 'payments'>('bookings')
const bookings = ref<BookingRow[]>([])
const payments = ref<PaymentRow[]>([])
const pending = ref(false)
const loadError = ref('')
const search = ref('')
const bookingStatusFilter = ref<'ALL' | BookingRow['status']>('ALL')
const paymentStatusFilter = ref<PaymentFilter>('ALL')
const expandedId = ref<string | null>(null)

const chipBase = 'border px-3 py-1.5 text-xs font-bold transition'
const chipActive = 'border-brand-primary bg-brand-primary text-white'
const chipIdle = 'border-brand-gray-200 bg-brand-gray-50 text-brand-navy hover:border-brand-primary/40'

function paymentStatusLabel(status: string) {
  const key = `booking.paymentStatus.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

function paymentChannelLabel(channel: ReturnType<typeof resolvePaymentChannel>) {
  if (channel === 'IPG') return t('admin.paymentChannelIpg')
  if (channel === 'ON_SITE') return t('admin.paymentChannelOnSite')
  if (channel === 'WALLET') return t('admin.paymentChannelWallet')
  return ''
}

function paymentFilterLabel(option: PaymentFilter) {
  if (option === 'ALL') return t('common.all')
  if (option === 'IPG' || option === 'ON_SITE') return paymentChannelLabel(option)
  return paymentStatusLabel(option)
}

function rowPaymentMethod(row: { payment?: { method: string } | null; paymentMethod?: string | null; method?: string }) {
  return row.payment?.method || row.paymentMethod || row.method || null
}

function paymentBadgeLabel(status: string, method?: string | null) {
  const channel = resolvePaymentChannel(method, status)
  if (status === 'PAID' && channel === 'IPG') return t('admin.paymentChannelIpg')
  if (channel === 'ON_SITE') return t('admin.paymentChannelOnSite')
  if (status === 'PAID' && channel === 'WALLET') return t('admin.paymentChannelWallet')
  return paymentStatusLabel(status)
}

function paymentMethodLine(status: string, method?: string | null) {
  const channel = resolvePaymentChannel(method, status)
  const badge = paymentBadgeLabel(status, method)
  const channelText = paymentChannelLabel(channel)
  return channelText && channelText !== badge ? channelText : ''
}

function paymentMethodDetail(method?: string | null, status?: string | null) {
  return paymentChannelLabel(resolvePaymentChannel(method, status)) || method || '—'
}

function bookingStatusLabel(status: string) {
  const key = `booking.status.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

function bookingStatusClass(status: string) {
  if (status === 'CONFIRMED') return 'bg-emerald-100 text-emerald-800'
  if (status === 'CANCELLED') return 'bg-red-100 text-red-800'
  return 'bg-amber-100 text-amber-900'
}

function paymentStatusClass(status: string) {
  if (status === 'PAID') return 'bg-emerald-100 text-emerald-800'
  if (status === 'FAILED' || status === 'REFUNDED') return 'bg-red-100 text-red-800'
  return 'bg-amber-100 text-amber-900'
}

function contactName(row: { user: { name: string } | null; guestName?: string | null }) {
  return row.user?.name || row.guestName || '—'
}

function contactLine(row: {
  user: { email: string } | null
  guestMobile?: string | null
}) {
  return row.user?.email || row.guestMobile || '—'
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  expandedId.value = null
  try {
    if (tab.value === 'bookings') {
      const params = new URLSearchParams({ limit: '50' })
      if (bookingStatusFilter.value !== 'ALL') params.set('status', bookingStatusFilter.value)
      if (isPaymentChannel(paymentStatusFilter.value)) params.set('paymentChannel', paymentStatusFilter.value)
      else if (paymentStatusFilter.value !== 'ALL') params.set('paymentStatus', paymentStatusFilter.value)
      if (search.value.trim()) params.set('q', search.value.trim())
      const data = await adminFetch<{ bookings: BookingRow[] }>(`/api/admin/bookings?${params}`)
      bookings.value = data.bookings
    } else {
      const params = new URLSearchParams({ limit: '50' })
      if (isPaymentChannel(paymentStatusFilter.value)) params.set('paymentChannel', paymentStatusFilter.value)
      else if (paymentStatusFilter.value !== 'ALL') params.set('status', paymentStatusFilter.value)
      if (search.value.trim()) params.set('q', search.value.trim())
      const data = await adminFetch<{ payments: PaymentRow[] }>(`/api/admin/payments?${params}`)
      payments.value = data.payments
    }
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

watch(tab, () => {
  search.value = ''
  bookingStatusFilter.value = 'ALL'
  paymentStatusFilter.value = 'ALL'
  if (secret.value) load()
})

watch([bookingStatusFilter, paymentStatusFilter], () => {
  if (secret.value) load()
})
</script>

<template>
  <div class="tail-page-stack">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="tail-page-title">{{ t('admin.bookingsTitle') }}</h1>
        <p class="text-sm text-brand-gray-600">{{ t('admin.bookingsSubtitle') }}</p>
      </div>
      <button
        type="button"
        class="border border-brand-gray-300 bg-white px-3 py-2 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40 disabled:opacity-60"
        style="border-radius: 2px;"
        :disabled="pending"
        @click="load"
      >
        {{ t('common.retry') }}
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        :class="[chipBase, tab === 'bookings' ? chipActive : chipIdle]"
        style="border-radius: 2px;"
        @click="tab = 'bookings'"
      >
        {{ t('admin.nav.bookings') }}
      </button>
      <button
        type="button"
        :class="[chipBase, tab === 'payments' ? chipActive : chipIdle]"
        style="border-radius: 2px;"
        @click="tab = 'payments'"
      >
        {{ t('admin.paymentsTab') }}
      </button>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <AppFormField :label="t('admin.searchBookings')" class="min-w-[12rem] flex-1">
        <input
          v-model="search"
          type="search"
          class="neo-input"
          style="border-radius: 2px;"
          :placeholder="t('admin.searchBookingsPlaceholder')"
          @keyup.enter="load"
        />
      </AppFormField>
      <button
        type="button"
        class="border border-brand-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-brand-navy transition hover:border-brand-primary/40"
        style="border-radius: 2px;"
        @click="load"
      >
        {{ t('admin.search') }}
      </button>
    </div>

    <div v-if="tab === 'bookings'" class="flex flex-wrap gap-2">
      <button
        v-for="option in (['ALL', 'CONFIRMED', 'PENDING', 'CANCELLED'] as const)"
        :key="option"
        type="button"
        :class="[chipBase, bookingStatusFilter === option ? chipActive : chipIdle]"
        style="border-radius: 2px;"
        @click="bookingStatusFilter = option"
      >
        {{ option === 'ALL' ? t('common.all') : bookingStatusLabel(option) }}
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="option in PAYMENT_FILTERS"
        :key="option"
        type="button"
        :class="[chipBase, paymentStatusFilter === option ? chipActive : chipIdle]"
        style="border-radius: 2px;"
        @click="paymentStatusFilter = option"
      >
        {{ paymentFilterLabel(option) }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
      <template v-if="tab === 'bookings'">
        <div v-if="bookings.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
          {{ t('common.empty') }}
        </div>
        <div v-else class="overflow-x-auto ios-card">
          <table class="w-full min-w-[860px] text-sm">
            <thead>
              <tr class="border-b border-brand-gray-100 text-start">
                <th class="p-3 font-bold">{{ t('common.date') }}</th>
                <th class="p-3 font-bold">{{ t('admin.clubName') }}</th>
                <th class="p-3 font-bold">{{ t('admin.contact') }}</th>
                <th class="p-3 font-bold">{{ t('admin.status') }}</th>
                <th class="p-3 font-bold">{{ t('admin.payment') }}</th>
                <th class="p-3 font-bold" />
              </tr>
            </thead>
            <tbody>
              <template v-for="row in bookings" :key="row.id">
                <tr class="border-b border-brand-gray-50">
                  <td class="p-3 tabular-nums whitespace-nowrap" dir="ltr">
                    {{ formatDate(row.date) }} {{ formatTimeLabel(row.startTime) }}
                  </td>
                  <td class="p-3">
                    <NuxtLink
                      :to="localePath(`/admin/clubs/${row.club.id}`)"
                      class="font-bold text-brand-navy underline"
                    >
                      {{ row.club.nameFa }}
                    </NuxtLink>
                    <div class="text-xs text-brand-gray-600">{{ row.courtNameFa }}</div>
                  </td>
                  <td class="p-3">
                    <div>{{ contactName(row) }}</div>
                    <div class="text-xs text-brand-gray-600" dir="ltr">{{ contactLine(row) }}</div>
                  </td>
                  <td class="p-3">
                    <span
                      class="px-2 py-0.5 text-xs font-bold"
                      style="border-radius: 2px;"
                      :class="bookingStatusClass(row.status)"
                    >
                      {{ bookingStatusLabel(row.status) }}
                    </span>
                  </td>
                  <td class="p-3">
                    <span
                      class="px-2 py-0.5 text-xs font-bold"
                      style="border-radius: 2px;"
                      :class="paymentStatusClass(row.paymentStatus)"
                    >
                      {{ paymentBadgeLabel(row.paymentStatus, rowPaymentMethod(row)) }}
                    </span>
                    <div
                      v-if="paymentMethodLine(row.paymentStatus, rowPaymentMethod(row))"
                      class="mt-1 text-xs text-brand-gray-600"
                    >
                      {{ paymentMethodLine(row.paymentStatus, rowPaymentMethod(row)) }}
                    </div>
                    <div v-if="row.payment" class="mt-1 text-xs tabular-nums text-brand-gray-600" dir="ltr">
                      {{ formatCurrency(row.payment.amount) }}
                    </div>
                  </td>
                  <td class="p-3 whitespace-nowrap">
                    <button
                      type="button"
                      class="border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40"
                      style="border-radius: 2px;"
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
                        <span>{{ t('admin.bookingId') }}</span>
                        <span dir="ltr">{{ row.id }}</span>
                      </li>
                      <li class="flex justify-between gap-2">
                        <span>{{ t('admin.bookingSource') }}</span>
                        <span dir="ltr">{{ row.source }}</span>
                      </li>
                      <li class="flex justify-between gap-2">
                        <span>{{ t('admin.city') }}</span>
                        <span>{{ row.club.city }}</span>
                      </li>
                      <li class="flex justify-between gap-2">
                        <span>{{ t('admin.createdAt') }}</span>
                        <span dir="ltr">{{ formatDate(row.createdAt) }}</span>
                      </li>
                      <li class="flex justify-between gap-2">
                        <span>{{ t('admin.paymentMethod') }}</span>
                        <span>{{ paymentMethodDetail(rowPaymentMethod(row), row.paymentStatus) }}</span>
                      </li>
                      <li v-if="row.guestMobile && row.user" class="flex justify-between gap-2">
                        <span>{{ t('admin.phone') }}</span>
                        <span dir="ltr">{{ row.guestMobile }}</span>
                      </li>
                    </ul>
                    <p class="mt-2 text-brand-gray-500">{{ t('admin.bookingsReadOnlyNote') }}</p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>

      <template v-else>
        <div v-if="payments.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
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
                <th class="p-3 font-bold">{{ t('admin.status') }}</th>
                <th class="p-3 font-bold" />
              </tr>
            </thead>
            <tbody>
              <template v-for="row in payments" :key="row.id">
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
                  <td class="p-3">
                    <span
                      class="px-2 py-0.5 text-xs font-bold"
                      style="border-radius: 2px;"
                      :class="paymentStatusClass(row.status)"
                    >
                      {{ paymentBadgeLabel(row.status, row.method) }}
                    </span>
                    <div
                      v-if="paymentMethodLine(row.status, row.method)"
                      class="mt-1 text-xs text-brand-gray-600"
                    >
                      {{ paymentMethodLine(row.status, row.method) }}
                    </div>
                  </td>
                  <td class="p-3 whitespace-nowrap">
                    <button
                      type="button"
                      class="border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40"
                      style="border-radius: 2px;"
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
                        <span>{{ t('admin.paymentId') }}</span>
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
                      <li class="flex justify-between gap-2">
                        <span>{{ t('admin.paymentMethod') }}</span>
                        <span>{{ paymentMethodDetail(row.method, row.status) }}</span>
                      </li>
                      <li v-if="row.bookingStatus" class="flex justify-between gap-2">
                        <span>{{ t('admin.nav.bookings') }}</span>
                        <span>{{ bookingStatusLabel(row.bookingStatus) }}</span>
                      </li>
                      <li v-if="row.date" class="flex justify-between gap-2">
                        <span>{{ t('common.date') }}</span>
                        <span dir="ltr">{{ formatDate(row.date) }} {{ formatTimeLabel(row.startTime) }}</span>
                      </li>
                    </ul>
                    <p class="mt-2 text-brand-gray-500">{{ t('admin.bookingsReadOnlyNote') }}</p>
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
