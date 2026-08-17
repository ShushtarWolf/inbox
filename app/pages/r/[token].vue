<script setup lang="ts">
definePageMeta({ layout: false, ssr: false })

type ReceiptSession = {
  date: string
  startTime: string
  endTime: string
  courtName: string
  price: number
}

type ReceiptPayload = {
  trackingCode: string
  guestName: string
  mobile: string
  clubName: string
  reserveDate: string
  paymentStatus: string
  paymentMethod: string
  session: ReceiptSession
  amount: number
  unpaid: boolean
  cancelled: boolean
  canPayOnline: boolean
}

const route = useRoute()
const { t, locale } = useI18n()
const { formatCurrency } = useFormatters()
const { fetchErrorMessage } = useFetchError()
const { redirectToPaymentGateway } = useCheckout()
const token = computed(() => String(route.params.token || ''))
const paying = ref(false)
const payError = ref('')

const { data, error, pending, refresh } = await useFetch<ReceiptPayload>(
  () => `/api/receipts/${encodeURIComponent(token.value)}`,
  { watch: [token] },
)

const paymentNotice = computed(() => {
  const q = String(route.query.payment || '')
  if (q === 'success') return t('booking.paymentSuccess')
  if (q === 'cancelled') return t('booking.paymentCancelled')
  if (q === 'error') return t('booking.paymentError')
  return ''
})

watch(() => route.query.payment, () => {
  if (route.query.payment) refresh()
})

function sessionWhen(session: ReceiptSession) {
  const time = session.endTime && session.endTime !== session.startTime
    ? `${session.startTime} - ${session.endTime}`
    : session.startTime
  return `${session.date} | ${time}`
}

async function pay() {
  if (!token.value || paying.value) return
  paying.value = true
  payError.value = ''
  try {
    const session = await $fetch<{ intent?: { redirectUrl?: string; status?: string } }>(
      `/api/receipts/${encodeURIComponent(token.value)}/checkout`,
      { method: 'POST' },
    )
    const url = session.intent?.redirectUrl
    if (url) {
      await redirectToPaymentGateway(url)
      return
    }
    await refresh()
  } catch (err: unknown) {
    payError.value = fetchErrorMessage(err, t('booking.gatewayRedirectStalled'))
  } finally {
    paying.value = false
  }
}
</script>

<template>
  <div class="receipt-page min-h-dvh bg-white px-4 py-6" :dir="locale === 'fa' ? 'rtl' : 'ltr'">
    <div class="mx-auto w-full max-w-[375px]">
      <header class="mb-5 flex items-center justify-between">
        <span />
        <NuxtLink to="/" class="inline-flex items-center gap-2">
          <InboxWordmark />
        </NuxtLink>
      </header>

      <p v-if="pending" class="text-sm text-brand-gray-600">{{ t('common.loading') }}</p>
      <p v-else-if="error" class="text-sm text-red-600">{{ t('booking.receiptNotFound') }}</p>

      <template v-else-if="data">
        <p v-if="paymentNotice" class="mb-3 text-sm text-start text-brand-navy">{{ paymentNotice }}</p>
        <p v-if="data.cancelled" class="mb-3 text-sm text-start text-red-600">{{ t('booking.receiptCancelled') }}</p>

        <h1 class="mb-4 text-base font-bold text-start text-brand-navy">{{ t('booking.receiptTitle') }}</h1>

        <dl class="receipt-rows text-sm">
          <div class="receipt-row">
            <dt>{{ t('booking.receiptTracking') }}</dt>
            <dd>{{ data.trackingCode }}</dd>
          </div>
          <div class="receipt-row">
            <dt>{{ t('booking.receiptFullName') }}</dt>
            <dd>{{ data.guestName || '—' }}</dd>
          </div>
          <div class="receipt-row">
            <dt>{{ t('booking.receiptMobile') }}</dt>
            <dd dir="ltr">{{ data.mobile || '—' }}</dd>
          </div>
          <div class="receipt-row">
            <dt>{{ t('booking.receiptClub') }}</dt>
            <dd>{{ data.clubName }}</dd>
          </div>
          <div class="receipt-row">
            <dt>{{ t('booking.receiptDate') }}</dt>
            <dd>{{ data.reserveDate }}</dd>
          </div>
          <div class="receipt-row">
            <dt>{{ t('booking.receiptPayStatus') }}</dt>
            <dd>{{ data.paymentStatus }}</dd>
          </div>
          <div class="receipt-row">
            <dt>{{ t('booking.receiptPayMethod') }}</dt>
            <dd>{{ data.paymentMethod }}</dd>
          </div>
        </dl>

        <section class="mt-5 border border-brand-gray-200 p-3" style="border-radius: 2px;">
          <h2 class="mb-3 text-sm font-bold text-start">{{ t('booking.receiptSessions') }}</h2>
          <p class="mb-2 text-xs font-bold text-start">{{ t('booking.receiptSessionN', { n: 1 }) }}</p>
          <dl class="receipt-rows text-sm">
            <div class="receipt-row">
              <dt>{{ t('booking.receiptDateTime') }}</dt>
              <dd>{{ sessionWhen(data.session) }}</dd>
            </div>
            <div v-if="data.session.courtName" class="receipt-row">
              <dt>{{ t('booking.courtsSection') }}</dt>
              <dd>{{ data.session.courtName }}</dd>
            </div>
            <div class="receipt-row">
              <dt>{{ t('booking.receiptPrice') }}</dt>
              <dd>{{ formatCurrency(data.session.price) }}</dd>
            </div>
          </dl>
        </section>

        <div class="mt-5 flex items-center justify-between text-sm">
          <span class="font-bold text-emerald-600">{{ formatCurrency(data.amount) }}</span>
          <span class="font-bold">{{ t('booking.receiptTotal') }}</span>
        </div>

        <p v-if="payError" class="mt-3 text-sm text-red-600 text-start">{{ payError }}</p>

        <button
          v-if="data.canPayOnline"
          type="button"
          class="canva-gate-btn-primary mt-6 bg-emerald-600 hover:brightness-110"
          :class="{ 'canva-cta-busy': paying }"
          :aria-busy="paying"
          @click="pay"
        >
          {{ paying ? t('booking.redirectingToGateway') : t('booking.receiptPayCta') }}
        </button>
        <p v-else-if="data.unpaid && !data.cancelled" class="mt-4 text-sm text-brand-gray-600 text-start">
          {{ t('booking.receiptPayAtClub') }}
        </p>
      </template>
    </div>
  </div>
</template>
