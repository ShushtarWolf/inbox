<script setup lang="ts">
const props = defineProps<{
  slot: {
    displayStatus: string
    startTime: string
    endTime: string
    booking?: {
      guestName?: string | null
      guestFamily?: string | null
      guestMobile?: string | null
      coachId?: string | null
      payment?: { method?: string; status?: string; amount?: number } | null
      paymentMethod?: string | null
      paymentStatus?: string | null
      comments?: string | null
      bookingEquipments?: Array<{
        equipment?: { nameFa: string; nameEn: string } | null
      }>
    } | null
  }
  coachName?: string
}>()

const { t } = useI18n()
const { localizedField } = useLocalizedField()
const { formatTimeRange } = useFormatters()

const guestName = computed(() =>
  [props.slot.booking?.guestName, props.slot.booking?.guestFamily].filter(Boolean).join(' ').trim(),
)

const paymentMethod = computed(() =>
  props.slot.booking?.payment?.method || props.slot.booking?.paymentMethod || '',
)

const paymentStatus = computed(() =>
  props.slot.booking?.payment?.status || props.slot.booking?.paymentStatus || '',
)

const equipmentNames = computed(() =>
  (props.slot.booking?.bookingEquipments || [])
    .map((item) => item.equipment ? localizedField(item.equipment, 'nameFa', 'nameEn') : '')
    .filter(Boolean)
    .join(', '),
)
</script>

<template>
  <div class="rounded-venus border border-brand-gray-200 bg-brand-gray-50 p-4 text-sm">
    <p class="text-xs font-bold uppercase tracking-wide text-brand-gray-600">{{ t('owner.currentBooking') }}</p>
    <p class="mt-2 font-bold text-brand-navy">
      <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
      · {{ t(`owner.status.${slot.displayStatus}`) }}
    </p>
    <dl class="mt-3 space-y-2">
      <div v-if="guestName" class="flex justify-between gap-3">
        <dt class="font-medium text-brand-gray-600">{{ t('owner.guestName') }}</dt>
        <dd class="font-bold text-brand-navy">{{ guestName }}</dd>
      </div>
      <div v-if="slot.booking?.guestMobile" class="flex justify-between gap-3">
        <dt class="font-medium text-brand-gray-600">{{ t('owner.guestMobile') }}</dt>
        <dd class="font-bold text-brand-navy"><bdi dir="ltr" class="tabular-nums">{{ slot.booking.guestMobile }}</bdi></dd>
      </div>
      <div v-if="paymentMethod" class="flex justify-between gap-3">
        <dt class="font-medium text-brand-gray-600">{{ t('owner.paymentMethod') }}</dt>
        <dd class="font-bold text-brand-navy">{{ t(`owner.paymentMethods.${paymentMethod}`) }}</dd>
      </div>
      <div v-if="paymentStatus" class="flex justify-between gap-3">
        <dt class="font-medium text-brand-gray-600">{{ t('owner.paymentStatusLabel') }}</dt>
        <dd class="font-bold text-brand-navy">{{ t(`booking.paymentStatus.${paymentStatus}`) }}</dd>
      </div>
      <div v-if="coachName" class="flex justify-between gap-3">
        <dt class="font-medium text-brand-gray-600">{{ t('owner.priceBreakdown.coach') }}</dt>
        <dd class="font-bold text-brand-navy">{{ coachName }}</dd>
      </div>
      <div v-if="equipmentNames" class="flex justify-between gap-3">
        <dt class="font-medium text-brand-gray-600">{{ t('owner.equipments') }}</dt>
        <dd class="font-bold text-brand-navy">{{ equipmentNames }}</dd>
      </div>
      <div v-if="slot.booking?.comments" class="flex flex-col gap-1">
        <dt class="font-medium text-brand-gray-600">{{ t('owner.comments') }}</dt>
        <dd class="font-bold text-brand-navy">{{ slot.booking.comments }}</dd>
      </div>
    </dl>
  </div>
</template>
