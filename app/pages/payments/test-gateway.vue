<script setup lang="ts">
/**
 * Local test IPG stand-in when PAYMENTS_MODE=test and ZARINPAL_MERCHANT_ID is unset.
 * Never used in live mode.
 */
definePageMeta({ layout: false, ssr: true })

const route = useRoute()
const { t, locale } = useI18n()
const { public: { paymentsMode } } = useRuntimeConfig()
const { formatCurrency } = useFormatters()

const provider = computed(() => String(route.query.provider || 'zarinpal'))
const authority = computed(() => String(route.query.Authority || route.query.ref || ''))
const amount = computed(() => {
  const n = Number(route.query.amount || 0)
  return Number.isFinite(n) ? n : 0
})

const allowed = computed(() => paymentsMode === 'test' && Boolean(authority.value))

function callbackUrl(status: 'OK' | 'NOK') {
  const q = new URLSearchParams({
    Authority: authority.value,
    Status: status,
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
  <div class="min-h-screen bg-brand-gray-50 px-4 py-10" :dir="locale === 'fa' ? 'rtl' : 'ltr'">
    <div class="mx-auto max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-sm">
      <h1 class="text-lg font-bold text-brand-gray-900">{{ t('booking.testGatewayTitle') }}</h1>
      <p class="text-sm text-brand-gray-600">{{ t('booking.testGatewayHint') }}</p>

      <template v-if="allowed">
        <p v-if="amount > 0" class="text-base font-bold tabular-nums">
          {{ formatCurrency(amount) }}
        </p>
        <p class="break-all font-mono text-xs text-brand-gray-500">{{ authority }}</p>
        <a :href="callbackUrl('OK')" class="btn-primary block w-full text-center">
          {{ t('booking.testGatewaySuccess') }}
        </a>
        <a :href="callbackUrl('NOK')" class="btn-ghost block w-full text-center">
          {{ t('booking.testGatewayCancel') }}
        </a>
      </template>
      <p v-else class="text-sm text-red-600">{{ t('booking.testGatewayUnavailable') }}</p>
    </div>
  </div>
</template>
