<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatCurrency, formatDate } = useFormatters()

type BookingRow = {
  id: string
  status: string
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
  bookingStatus: string | null
}

const tab = ref<'bookings' | 'payments'>('bookings')
const bookings = ref<BookingRow[]>([])
const payments = ref<PaymentRow[]>([])
const pending = ref(false)
const loadError = ref('')

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    if (tab.value === 'bookings') {
      const data = await adminFetch<{ bookings: BookingRow[] }>('/api/admin/bookings?limit=50')
      bookings.value = data.bookings
    } else {
      const data = await adminFetch<{ payments: PaymentRow[] }>('/api/admin/payments?limit=50')
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
  if (secret.value) load()
})
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ t('admin.bookingsTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('admin.bookingsSubtitle') }}</p>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="neo-pill text-xs"
        :class="tab === 'bookings' ? 'neo-pill-active' : ''"
        @click="tab = 'bookings'"
      >
        {{ t('admin.nav.bookings') }}
      </button>
      <button
        type="button"
        class="neo-pill text-xs"
        :class="tab === 'payments' ? 'neo-pill-active' : ''"
        @click="tab = 'payments'"
      >
        {{ t('admin.paymentsTab') }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
      <template v-if="tab === 'bookings'">
        <div v-if="bookings.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
          {{ t('common.empty') }}
        </div>
        <div v-else class="overflow-x-auto ios-card">
          <table class="w-full min-w-[820px] text-sm">
            <thead>
              <tr class="border-b border-brand-gray-100 text-start">
                <th class="p-3 font-bold">{{ t('common.date') }}</th>
                <th class="p-3 font-bold">{{ t('admin.clubName') }}</th>
                <th class="p-3 font-bold">{{ t('admin.contact') }}</th>
                <th class="p-3 font-bold">{{ t('admin.status') }}</th>
                <th class="p-3 font-bold">{{ t('admin.payment') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in bookings" :key="row.id" class="border-b border-brand-gray-50">
                <td class="p-3 tabular-nums whitespace-nowrap" dir="ltr">
                  {{ row.date }} {{ row.startTime }}
                </td>
                <td class="p-3">
                  <div class="font-bold">{{ row.club.nameFa }}</div>
                  <div class="text-xs text-brand-gray-600">{{ row.courtNameFa }}</div>
                </td>
                <td class="p-3">
                  <div>{{ row.user?.name || row.guestName || '—' }}</div>
                  <div class="text-xs text-brand-gray-600" dir="ltr">{{ row.user?.email || row.guestMobile }}</div>
                </td>
                <td class="p-3">{{ row.status }}</td>
                <td class="p-3">
                  <div>{{ row.paymentStatus }}</div>
                  <div v-if="row.payment" class="text-xs tabular-nums text-brand-gray-600" dir="ltr">
                    {{ formatCurrency(row.payment.amount) }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template v-else>
        <div v-if="payments.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
          {{ t('common.empty') }}
        </div>
        <div v-else class="overflow-x-auto ios-card">
          <table class="w-full min-w-[720px] text-sm">
            <thead>
              <tr class="border-b border-brand-gray-100 text-start">
                <th class="p-3 font-bold">{{ t('common.date') }}</th>
                <th class="p-3 font-bold">{{ t('admin.clubName') }}</th>
                <th class="p-3 font-bold">{{ t('admin.contact') }}</th>
                <th class="p-3 font-bold">{{ t('admin.amount') }}</th>
                <th class="p-3 font-bold">{{ t('admin.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in payments" :key="row.id" class="border-b border-brand-gray-50">
                <td class="p-3 tabular-nums whitespace-nowrap" dir="ltr">{{ formatDate(row.createdAt) }}</td>
                <td class="p-3">{{ row.club?.nameFa || '—' }}</td>
                <td class="p-3">
                  <div>{{ row.user?.name || '—' }}</div>
                  <div class="text-xs text-brand-gray-600" dir="ltr">{{ row.user?.email }}</div>
                </td>
                <td class="p-3 tabular-nums" dir="ltr">{{ formatCurrency(row.amount) }}</td>
                <td class="p-3">
                  <div>{{ row.status }}</div>
                  <div class="text-xs text-brand-gray-600">{{ row.method }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </AppAsyncState>
  </div>
</template>
