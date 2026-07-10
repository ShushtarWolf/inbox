<script setup lang="ts">
const props = defineProps<{
  courtPrice: number
  coachPrice?: number
  equipmentPrice?: number
  sessionCount?: number
  showEstimated?: boolean
}>()

const { t } = useI18n()
const { formatCurrency } = useFormatters()

const perSessionTotal = computed(() =>
  props.courtPrice + (props.coachPrice || 0) + (props.equipmentPrice || 0),
)

const displayTotal = computed(() =>
  props.showEstimated ? perSessionTotal.value * (props.sessionCount || 1) : perSessionTotal.value,
)

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
    <div v-if="showEstimated && (sessionCount || 0) > 1" class="mt-2 flex items-center justify-between gap-2 text-xs text-brand-gray-600">
      <span>{{ t('owner.priceBreakdown.perSession') }}</span>
      <span>{{ priceLabel(perSessionTotal) }}</span>
    </div>
    <div class="my-3 border-t border-brand-gray-200" />
    <div class="flex items-center justify-between gap-2 font-bold text-brand-navy">
      <span>{{ showEstimated ? t('owner.priceBreakdown.estimatedTotal') : t('owner.priceBreakdown.total') }}</span>
      <span class="venus-price">{{ priceLabel(displayTotal) }}</span>
    </div>
  </div>
</template>
