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
  clubAddress?: string
  clubPhone?: string
  reserveDate: string
  paymentStatus: string
  paymentMethod: string
  session: ReceiptSession
  sessions?: ReceiptSession[]
  amount: number
  unpaid: boolean
  cancelled: boolean
  canPayOnline: boolean
  kind?: 'single' | 'season'
}

const route = useRoute()
const { t, locale } = useI18n()
const { formatCurrency, formatPhone } = useFormatters()
const { fetchErrorMessage } = useFetchError()
const { redirectToPaymentGateway } = useCheckout()
const token = computed(() => String(route.params.token || ''))
const paying = ref(false)
const payError = ref('')
const choseCashAtClub = ref(false)

const { data, error, pending, refresh } = await useFetch<ReceiptPayload>(
  () => `/api/receipts/${encodeURIComponent(token.value)}`,
  { watch: [token] },
)
const showPending = useHeldPending(pending, { forceRelease: () => Boolean(error.value) })

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

const sessionList = computed(() => {
  const d = data.value
  if (!d) return [] as ReceiptSession[]
  if (d.sessions?.length) return d.sessions
  return d.session ? [d.session] : []
})

const isPaid = computed(() => {
  const d = data.value
  if (!d || d.cancelled || d.unpaid) return false
  return true
})

const isCashMethod = computed(() => {
  const m = data.value?.paymentMethod || ''
  return m.includes('نقدی') || /cash/i.test(m)
})

const badge = computed(() => {
  const d = data.value
  if (!d) return { text: '', tone: 'amber' as const }
  if (d.cancelled) return { text: d.paymentStatus, tone: 'amber' as const }
  if (choseCashAtClub.value && d.unpaid) {
    return { text: t('booking.receiptBadgeCash'), tone: 'green' as const }
  }
  if (isPaid.value) {
    if (isCashMethod.value) return { text: t('booking.receiptBadgeCash'), tone: 'green' as const }
    return { text: t('booking.receiptBadgePaid'), tone: 'green' as const }
  }
  return { text: t('booking.receiptBadgePending'), tone: 'amber' as const }
})

const greeting = computed(() => {
  const name = data.value?.guestName?.trim()
  return name
    ? t('booking.receiptGreeting', { name })
    : t('booking.receiptGreetingFallback')
})

const clubMark = computed(() => {
  const name = data.value?.clubName?.trim() || 'ا'
  return name.charAt(0)
})

function sessionTime(session: ReceiptSession) {
  if (session.endTime && session.endTime !== session.startTime) {
    return `${session.startTime} تا ${session.endTime}`
  }
  return session.startTime
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
  }
  catch (err: unknown) {
    payError.value = fetchErrorMessage(err, t('booking.gatewayRedirectStalled'))
  }
  finally {
    paying.value = false
  }
}

function chooseCashAtClub() {
  choseCashAtClub.value = true
}
</script>

<template>
  <div class="receipt-player min-h-dvh" :dir="locale === 'fa' ? 'rtl' : 'ltr'">
    <AppVenusSpinner v-if="showPending" size="sm" :label="t('common.loading')" class="p-8" />
    <p v-else-if="error" class="p-6 text-sm text-red-600">{{ t('booking.receiptNotFound') }}</p>

    <template v-else-if="data">
      <header class="receipt-player-top sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#ECE9E4] px-5 py-3.5">
        <div class="flex min-w-0 items-center gap-3">
          <span class="receipt-player-mark" aria-hidden="true">{{ clubMark }}</span>
          <div class="min-w-0">
            <strong class="block truncate text-[15px] font-extrabold leading-snug">{{ data.clubName }}</strong>
            <span class="block text-[11px] text-[#8C8A84]">{{ t('booking.receiptPlatformTag') }}</span>
          </div>
        </div>
        <span
          class="receipt-player-badge flex-none"
          :class="badge.tone === 'green' ? 'is-green' : 'is-amber'"
        >
          {{ badge.text }}
        </span>
      </header>

      <main class="mx-auto max-w-[640px] px-4 py-7 pb-28">
        <p v-if="paymentNotice" class="mb-3 text-sm text-start text-brand-navy">{{ paymentNotice }}</p>
        <p v-if="data.cancelled" class="mb-3 text-sm text-start text-red-600">{{ t('booking.receiptCancelled') }}</p>

        <div class="receipt-player-card">
          <h1 class="text-[22px] font-extrabold text-[#1F1F1D]">{{ greeting }}</h1>
          <p class="mt-1 text-[13.5px] text-[#55534E]">
            {{ data.kind === 'season' ? t('booking.receiptSeasonSub') : t('booking.receiptTitle') }}
          </p>

          <div class="receipt-player-meta mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div>
              <span>{{ t('booking.receiptTracking') }}</span>
              <b dir="ltr">{{ data.trackingCode }}</b>
            </div>
            <div>
              <span>{{ t('booking.receiptMobile') }}</span>
              <b dir="ltr" class="tabular-nums">{{ data.mobile ? formatPhone(data.mobile) : '—' }}</b>
            </div>
            <div class="col-span-2 sm:col-span-1">
              <span>{{ t('booking.receiptDate') }}</span>
              <b>{{ data.reserveDate }}</b>
            </div>
          </div>

          <div class="receipt-player-club mt-5">
            <b class="mb-1.5 block text-sm">{{ t('booking.receiptClubDetails') }}</b>
            <p class="text-[13px] text-[#55534E]">{{ data.clubName }}</p>
            <p v-if="data.clubAddress" class="mt-1 text-[13px] text-[#55534E]">{{ data.clubAddress }}</p>
            <p v-if="data.clubPhone" class="mt-1 text-[13px] text-[#55534E]" dir="ltr">
              <bdi>{{ formatPhone(data.clubPhone) }}</bdi>
            </p>
          </div>

          <h2 class="mt-5 mb-2.5 text-[15px] font-extrabold">{{ t('booking.receiptSessions') }}</h2>
          <div
            v-for="(session, idx) in sessionList"
            :key="`${session.date}-${session.startTime}-${idx}`"
            class="receipt-player-sess mb-2 flex flex-wrap items-center gap-3"
          >
            <span v-if="session.courtName" class="receipt-player-field">{{ session.courtName }}</span>
            <span class="text-[13px] font-semibold">{{ session.date }}</span>
            <span class="text-[12.5px] text-[#55534E]">
              <bdi dir="ltr">{{ sessionTime(session) }}</bdi>
            </span>
            <span class="ms-auto text-sm font-extrabold tabular-nums">{{ formatCurrency(session.price) }}</span>
          </div>

          <div class="receipt-player-total mt-3.5 flex items-center justify-between gap-2">
            <span class="text-[13.5px] font-semibold text-[#55534E]">{{ t('booking.receiptTotal') }}</span>
            <b class="text-xl font-extrabold tabular-nums">{{ formatCurrency(data.amount) }}</b>
          </div>

          <p v-if="payError" class="mt-3 text-sm text-red-600 text-start">{{ payError }}</p>

          <div class="mt-4">
            <template v-if="choseCashAtClub && data.unpaid && !data.cancelled">
              <div class="receipt-player-ok">
                <div>
                  <b class="block font-extrabold">{{ t('booking.receiptCashOk') }}</b>
                  <p class="mt-0.5 text-[12.5px] font-medium leading-7 opacity-85">{{ t('booking.receiptPayAtClubNote') }}</p>
                </div>
              </div>
            </template>
            <template v-else-if="isPaid && !data.cancelled">
              <div class="receipt-player-ok">
                <div>
                  <b class="block font-extrabold">{{ isCashMethod ? t('booking.receiptCashOk') : t('booking.receiptPaidOk') }}</b>
                  <p class="mt-0.5 text-[12.5px] font-medium leading-7 opacity-85">
                    {{ isCashMethod ? t('booking.receiptPayAtClubNote') : t('booking.receiptPaidOkHint') }}
                  </p>
                </div>
              </div>
            </template>
            <template v-else-if="data.unpaid && !data.cancelled">
              <div class="flex flex-col gap-2.5">
                <button
                  v-if="data.canPayOnline"
                  type="button"
                  class="receipt-player-pay"
                  :class="{ 'opacity-70': paying }"
                  :aria-busy="paying"
                  @click="pay"
                >
                  {{ paying
                    ? t('booking.redirectingToGateway')
                    : t('booking.receiptPayCtaAmount', { amount: formatCurrency(data.amount) }) }}
                </button>
                <button
                  type="button"
                  class="receipt-player-cash-link"
                  @click="chooseCashAtClub"
                >
                  {{ t('booking.receiptPayAtClubCta') }}
                </button>
                <p v-if="!data.canPayOnline" class="text-center text-[11.5px] text-[#8C8A84]">
                  {{ t('booking.receiptPayAtClub') }}
                </p>
              </div>
            </template>
          </div>
        </div>

        <p class="mt-4 text-center text-[11.5px] leading-8 text-[#8C8A84]">
          {{ t('booking.receiptFooter') }}
        </p>
      </main>
    </template>
  </div>
</template>

<style scoped>
.receipt-player {
  background: #F6F5F2;
  color: #1F1F1D;
}
.receipt-player-top {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
}
.receipt-player-mark {
  width: 42px;
  height: 42px;
  background: #E02330;
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 20px;
  flex: none;
  border-radius: 0;
}
.receipt-player-badge {
  font-size: 12px;
  font-weight: 800;
  padding: 7px 15px;
  border-radius: 0;
}
.receipt-player-badge.is-amber {
  background: #FBF1DE;
  color: #95590A;
}
.receipt-player-badge.is-green {
  background: #E8F3EC;
  color: #1D5C3F;
}
.receipt-player-card {
  background: #fff;
  border: 1px solid #ECE9E4;
  border-top: 4px solid #E02330;
  box-shadow: 0 1px 2px rgba(31, 31, 29, 0.04), 0 10px 28px -16px rgba(31, 31, 29, 0.14);
  padding: 26px 28px;
  border-radius: 0;
}
@media (max-width: 560px) {
  .receipt-player-card {
    padding: 20px 16px;
  }
}
.receipt-player-meta > div {
  background: #FAF9F6;
  border: 1px solid #ECE9E4;
  padding: 9px 13px;
  min-width: 0;
  border-radius: 0;
}
.receipt-player-meta span {
  display: block;
  font-size: 11px;
  color: #8C8A84;
}
.receipt-player-meta b {
  display: block;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.receipt-player-club {
  border: 1px solid #ECE9E4;
  padding: 14px 16px;
  background: #FAF9F6;
  border-radius: 0;
}
.receipt-player-sess {
  border: 1px solid #ECE9E4;
  padding: 11px 14px;
  background: #FAF9F6;
  border-radius: 0;
}
.receipt-player-field {
  font-weight: 700;
  font-size: 12.5px;
  background: #F1EFEA;
  padding: 4px 10px;
  flex: none;
  border-radius: 0;
}
.receipt-player-total {
  background: #FAF9F6;
  border: 1px solid #ECE9E4;
  padding: 13px 16px;
  border-radius: 0;
}
.receipt-player-pay {
  width: 100%;
  height: 52px;
  background: #E02330;
  color: #fff;
  font-weight: 700;
  font-size: 15.5px;
  border: 0;
  border-radius: 0;
  cursor: pointer;
}
.receipt-player-pay:hover {
  background: #C0141F;
}
.receipt-player-cash-link {
  align-self: center;
  color: #55534E;
  font-size: 13px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 4px;
  background: none;
  border: 0;
  cursor: pointer;
  padding: 4px;
}
.receipt-player-cash-link:hover {
  color: #C0141F;
}
.receipt-player-ok {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: #E8F3EC;
  border: 1px solid #CFE5D8;
  color: #1D5C3F;
  padding: 14px 16px;
  font-size: 14px;
  border-radius: 0;
}
</style>
