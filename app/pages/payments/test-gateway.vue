<script setup lang="ts">
/**
 * Local test IPG stand-in when PAYMENTS_MODE=test and SEP_TERMINAL_ID is unset.
 * Never used in live mode.
 */
definePageMeta({ layout: false, ssr: true })

const route = useRoute()
const { t, locale } = useI18n()
const { public: { paymentsMode } } = useRuntimeConfig()
const { formatCurrency } = useFormatters()

const provider = computed(() => String(route.query.provider || 'sep'))
const authority = computed(() => String(
  route.query.ResNum || route.query.Authority || route.query.ref || '',
))
const amount = computed(() => {
  const n = Number(route.query.amount || 0)
  return Number.isFinite(n) ? n : 0
})

const allowed = computed(() => paymentsMode === 'test' && Boolean(authority.value))

function callbackUrl(status: 'OK' | 'NOK') {
  const q = new URLSearchParams({
    ResNum: authority.value,
    State: status,
  })
  return `/payments/callback/${encodeURIComponent(provider.value)}?${q.toString()}`
}

onMounted(() => {
  if (paymentsMode === 'live') {
    navigateTo('/', { replace: true })
  }
})
</script>

<template>
  <div class="min-h-screen bg-brand-cream px-4 py-10" :dir="locale === 'fa' ? 'rtl' : 'ltr'">
    <!-- Designer zgw mock gateway card (test mode only; real IPG unchanged). -->
    <div class="mx-auto mt-[70px] w-full max-w-[460px] space-y-4 border border-brand-navy/30 bg-white p-[30px] text-center" style="border-radius: var(--sz-canva-radius);">
      <div class="flex justify-center"><InboxBrandLockup height-class="h-7" /></div>
      <h1 class="text-lg font-bold text-brand-navy">{{ t('booking.testGatewayTitle') }}</h1>
      <p class="text-sm text-brand-gray-600">{{ t('booking.testGatewayHint') }}</p>

      <template v-if="allowed">
        <p v-if="amount > 0" class="text-xl font-black tabular-nums text-brand-navy">
          {{ formatCurrency(amount) }}
        </p>
        <p class="break-all font-mono text-xs text-brand-gray-500" dir="ltr">{{ authority }}</p>
        <a :href="callbackUrl('OK')" class="canva-gate-btn-primary block w-full text-center">
          {{ t('booking.testGatewaySuccess') }}
        </a>
        <a :href="callbackUrl('NOK')" class="canva-gate-btn-secondary block w-full text-center">
          {{ t('booking.testGatewayCancel') }}
        </a>
      </template>
      <p v-else class="text-sm text-red-600">{{ t('booking.testGatewayUnavailable') }}</p>
    </div>
  </div>
</template>
