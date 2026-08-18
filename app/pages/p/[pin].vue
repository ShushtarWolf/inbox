<script setup lang="ts">
definePageMeta({ layout: false, ssr: false })

const route = useRoute()
const { t } = useI18n()
const pin = computed(() => String(route.params.pin || ''))

const { data, error, pending } = await useFetch<{ token: string }>(
  () => `/api/pay-link/${encodeURIComponent(pin.value)}`,
  { watch: [pin] },
)

watch(
  data,
  async (payload) => {
    if (!payload?.token) return
    await navigateTo(`/r/${encodeURIComponent(payload.token)}`, { replace: true })
  },
  { immediate: true },
)
</script>

<template>
  <div class="min-h-dvh bg-white px-4 py-6">
    <p v-if="pending" class="text-sm text-brand-gray-600">{{ t('common.loading') }}</p>
    <p v-else-if="error || !data?.token" class="text-sm text-red-600">{{ t('booking.receiptNotFound') }}</p>
  </div>
</template>
