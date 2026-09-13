<script setup lang="ts">
const props = defineProps<{
  courtPrice: number
  coachPrice?: number
  equipmentPrice?: number
  sessionCount?: number
  showEstimated?: boolean
  /** When true, total is based on previewed free slots (not a theoretical calendar count). */
  previewConfirmed?: boolean
}>()

const { t } = useI18n()
const { formatCurrency, formatNumber } = useFormatters()

const perSessionTotal = computed(() =>
  props.courtPrice + (props.coachPrice || 0) + (props.equipmentPrice || 0),
)

const sessions = computed(() => Math.max(0, props.sessionCount || 0))

const displayTotal = computed(() => {
  if (!props.showEstimated) return perSessionTotal.value
  const count = sessions.value > 0 ? sessions.value : 1
  return perSessionTotal.value * count
})

function priceLabel(amount: number) {
  return amount ? formatCurrency(amount) : t('owner.free')
}
</script>

<template>
  <div class="venus-widget-card-accent p-4 text-sm">
    <div class="flex items-center justify-between gap-2">
      <span class="font-medium text-brand-gray-600">{{ t('owner.priceBreakdown.court') }}</span>
      <span class="font-bold text-brand-navy">{{ priceLabel(courtPrice) }}</span>
    </div>
    <div v-if="coachPrice !== undefined" class="mt-2 flex items-center justify-between gap-2">
      <span class="font-medium text-brand-gray-600">{{ t('owner.priceBreakdown.coach') }}</span>
      <span class="font-bold text-brand-navy">{{ priceLabel(coachPrice) }}</span>
    </div>
    <div class="mt-2 flex items-center justify-between gap-2">
      <span class="font-medium text-brand-gray-600">{{ t('owner.priceBreakdown.equipment') }}</span>
      <span class="font-bold text-brand-navy">{{ priceLabel(equipmentPrice || 0) }}</span>
    </div>
    <div v-if="showEstimated && sessions > 0" class="mt-2 flex items-center justify-between gap-2 text-xs text-brand-gray-600">
      <span>{{ t('owner.priceBreakdown.perSession') }}</span>
      <span>{{ priceLabel(perSessionTotal) }}</span>
    </div>
    <div v-if="showEstimated && sessions > 0" class="mt-2 flex items-center justify-between gap-2 text-xs font-bold text-brand-navy">
      <span>{{ t('owner.priceBreakdown.sessionMultiplier', { count: formatNumber(sessions) }) }}</span>
      <span dir="ltr" class="tabular-nums">{{ formatNumber(sessions) }} × {{ priceLabel(perSessionTotal) }}</span>
    </div>
    <div class="my-3 border-t border-brand-gray-200" />
    <div class="flex items-center justify-between gap-2 font-bold text-brand-navy">
      <span>{{ showEstimated ? t('owner.priceBreakdown.estimatedTotal') : t('owner.priceBreakdown.total') }}</span>
      <span class="venus-price">{{ priceLabel(displayTotal) }}</span>
    </div>
    <p
      v-if="showEstimated && sessions > 0"
      class="mt-2 text-start text-[11px] font-medium text-brand-gray-500"
    >
      {{ previewConfirmed
        ? t('owner.priceBreakdown.estimateFromPreview')
        : t('owner.priceBreakdown.estimateBeforePreview') }}
    </p>
  </div>
</template>
