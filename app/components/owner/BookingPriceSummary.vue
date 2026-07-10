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
  <div class="mt-4 rounded-xl border border-[#ece8f6] bg-[#faf8ff] p-3 text-sm">
    <div class="flex items-center justify-between gap-2">
      <span class="text-brand-gray-600">{{ t('owner.priceBreakdown.court') }}</span>
      <span class="font-semibold">{{ priceLabel(courtPrice) }}</span>
    </div>
    <div v-if="coachPrice !== undefined" class="mt-2 flex items-center justify-between gap-2">
      <span class="text-brand-gray-600">{{ t('owner.priceBreakdown.coach') }}</span>
      <span class="font-semibold">{{ priceLabel(coachPrice) }}</span>
    </div>
    <div class="mt-2 flex items-center justify-between gap-2">
      <span class="text-brand-gray-600">{{ t('owner.priceBreakdown.equipment') }}</span>
      <span class="font-semibold">{{ priceLabel(equipmentPrice || 0) }}</span>
    </div>
    <div v-if="showEstimated && (sessionCount || 0) > 1" class="mt-2 flex items-center justify-between gap-2 text-xs text-brand-gray-600">
      <span>{{ t('owner.priceBreakdown.perSession') }}</span>
      <span>{{ priceLabel(perSessionTotal) }}</span>
    </div>
    <div class="my-2 border-t border-[#e9e6f2]" />
    <div class="flex items-center justify-between gap-2 font-bold">
      <span>{{ showEstimated ? t('owner.priceBreakdown.estimatedTotal') : t('owner.priceBreakdown.total') }}</span>
      <span class="text-brand-primary">{{ priceLabel(displayTotal) }}</span>
    </div>
  </div>
</template>
