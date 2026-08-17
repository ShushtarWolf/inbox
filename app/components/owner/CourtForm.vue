<script setup lang="ts">
import { parseImagesJson, serializeImagesJson } from '#shared/courtFacilities.ts'
import { COURT_BULK_MAX, COURT_BULK_MIN, parseCourtBulkCount } from '#shared/courtBulk.ts'

const props = defineProps<{
  court?: {
    id: string
    nameFa: string
    nameEn: string
    price: number
    image?: string | null
    imagesJson?: string | null
    openHour?: number | null
    closeHour?: number | null
    facilitiesJson?: string | null
    pricingJson?: string | null
    sport?: { slug: string }
  } | null
  clubOpenHour: number
  clubCloseHour: number
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [body: Record<string, unknown>]
  cancel: []
  delete: [id: string]
}>()

const { t } = useI18n()

const form = reactive({
  nameFa: '',
  nameEn: '',
  price: 600000,
  sportSlug: 'padel',
  images: [] as string[],
  openHour: null as number | null,
  closeHour: null as number | null,
  useClubHours: true,
  pricingJson: null as string | null,
  count: 1,
})

const submitLabel = computed(() => {
  if (props.court) return t('common.save')
  if (form.count > 1) return t('owner.settingsPage.submitCourts', { count: form.count })
  return t('owner.settingsPage.submitCourt')
})

watch(() => props.court, (court) => {
  if (!court) {
    form.nameFa = ''
    form.nameEn = ''
    form.price = 600000
    form.sportSlug = 'padel'
    form.images = []
    form.openHour = null
    form.closeHour = null
    form.useClubHours = true
    form.pricingJson = null
    form.count = 1
    return
  }
  form.nameFa = court.nameFa
  form.nameEn = court.nameEn
  form.price = court.price
  form.sportSlug = court.sport?.slug || 'padel'
  form.images = parseImagesJson(court.imagesJson, court.image)
  form.openHour = court.openHour ?? null
  form.closeHour = court.closeHour ?? null
  form.useClubHours = court.openHour == null && court.closeHour == null
  form.pricingJson = court.pricingJson ?? null
  form.count = 1
}, { immediate: true })

function submit() {
  let count = 1
  if (!props.court) {
    try {
      count = parseCourtBulkCount(form.count)
    } catch {
      count = COURT_BULK_MIN
    }
  }
  const imagesJson = serializeImagesJson(form.images)
  emit('save', {
    nameFa: form.nameFa,
    nameEn: form.nameEn,
    price: form.price,
    sportSlug: form.sportSlug,
    image: form.images[0] || null,
    imagesJson,
    openHour: form.useClubHours ? null : form.openHour,
    closeHour: form.useClubHours ? null : form.closeHour,
    pricingJson: form.pricingJson,
    count,
  })
}
</script>

<template>
  <div class="canva-court-form space-y-4 text-start">
    <div class="grid grid-cols-2 gap-2">
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.courtNameFa') }}</span>
        <input v-model="form.nameFa" required class="neo-input">
      </label>
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.courtNameEn') }}</span>
        <input v-model="form.nameEn" required dir="ltr" class="neo-input">
      </label>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('common.currency') }}</span>
        <input v-model.number="form.price" type="number" min="0" dir="ltr" class="neo-input tabular-nums">
        <AppEnglishDigitsHint />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.courtSport') }}</span>
        <select v-model="form.sportSlug" class="neo-select">
          <option value="padel">{{ t('clubs.sportPadel') }}</option>
          <option value="tennis">{{ t('clubs.sportTennis') }}</option>
        </select>
      </label>
    </div>

    <label v-if="!court" class="block text-sm">
      <span class="mb-1 block font-bold">{{ t('owner.settingsPage.courtCount') }}</span>
      <input
        v-model.number="form.count"
        type="number"
        :min="COURT_BULK_MIN"
        :max="COURT_BULK_MAX"
        dir="ltr"
        class="neo-input tabular-nums"
      >
      <AppEnglishDigitsHint />
      <span class="mt-1 block text-xs text-brand-gray-600">{{ t('owner.settingsPage.courtCountHint') }}</span>
    </label>

    <label class="canva-settings-check">
      <input v-model="form.useClubHours" type="checkbox" class="canva-settings-checkbox">
      <span>{{ t('owner.settingsPage.useClubHours') }}</span>
    </label>
    <div v-if="!form.useClubHours" class="grid grid-cols-2 gap-2">
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.openHour') }}</span>
        <input v-model.number="form.openHour" type="number" min="0" max="23" dir="ltr" class="neo-input tabular-nums">
      </label>
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.closeHour') }}</span>
        <input v-model.number="form.closeHour" type="number" min="1" max="24" dir="ltr" class="neo-input tabular-nums">
      </label>
    </div>

    <OwnerCourtPricingTimeline
      v-model="form.pricingJson"
      :base-price="form.price"
      :open-hour="form.useClubHours ? clubOpenHour : (form.openHour ?? clubOpenHour)"
      :close-hour="form.useClubHours ? clubCloseHour : (form.closeHour ?? clubCloseHour)"
    />

    <OwnerPhotoSlots v-model="form.images" :max="4" />

    <div class="space-y-2 pt-1">
      <button
        type="button"
        class="canva-owner-save-cta"
        :disabled="saving || !form.nameFa"
        @click="submit"
      >
        {{ saving ? t('common.loading') : submitLabel }}
      </button>
      <button
        v-if="court"
        type="button"
        class="canva-owner-secondary-cta text-red-600"
        :disabled="saving"
        @click="emit('delete', court.id)"
      >
        {{ t('common.delete') }}
      </button>
    </div>
  </div>
</template>
