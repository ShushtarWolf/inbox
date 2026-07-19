<script setup lang="ts">
defineProps<{
  lines: Array<{ label: string; amount: string; muted?: boolean }>
  totalLabel: string
  totalAmount: string
  paymentNote?: string
  cancelNote?: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <div class="ios-card space-y-2 p-4 text-sm">
    <p class="font-bold">{{ t('booking.costSummaryTitle') }}</p>
    <div
      v-for="(line, idx) in lines"
      :key="idx"
      class="flex items-center justify-between gap-3"
      :class="line.muted ? 'text-brand-gray-600' : ''"
    >
      <span>{{ line.label }}</span>
      <span class="font-medium tabular-nums" dir="ltr">{{ line.amount }}</span>
    </div>
    <div class="flex items-center justify-between gap-3 border-t border-brand-gray-200 pt-2 font-bold">
      <span>{{ totalLabel }}</span>
      <span class="tabular-nums text-brand-navy" dir="ltr">{{ totalAmount }}</span>
    </div>
    <p v-if="paymentNote" class="text-xs text-brand-gray-600">{{ paymentNote }}</p>
    <p v-if="cancelNote" class="text-xs text-brand-gray-600">
      {{ cancelNote }}
      <NuxtLink :to="localePath('/cancellation')" class="font-bold text-brand-primary underline">
        {{ t('legal.cancellation') }}
      </NuxtLink>
    </p>
  </div>
</template>
