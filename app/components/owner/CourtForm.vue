<script setup lang="ts">
import { parseImagesJson, serializeImagesJson } from '#shared/courtFacilities.ts'
import { samePricingJson } from '#shared/courtPricing.ts'
import {
  buildBulkCourtPatch,
  COURT_BULK_MAX,
  COURT_BULK_MIN,
  parseCourtBulkCount,
  type BulkCourtFields,
} from '#shared/courtBulk.ts'
import { COURT_AUDIENCE_VALUES, parseCourtAudience, type CourtAudience } from '#shared/courtAudience.ts'

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
    audience?: string | null
    sport?: { slug: string }
  } | null
  clubOpenHour: number
  clubCloseHour: number
  saving?: boolean
  /** Apply shared fields to every court in the club. */
  bulkEdit?: boolean
  bulkCount?: number
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
  audience: 'MIXED' as CourtAudience,
  notifyFutureBookings: false,
  count: 1,
  /** Bulk only: owner explicitly chose to replace time pricing on every court. */
  applyPricingToAll: false,
})

/** Bulk only: values the sheet opened with, so we send just what the owner changed. */
let bulkInitial: BulkCourtFields | null = null

function currentBulkFields(): BulkCourtFields {
  return {
    price: form.price ?? 0,
    sportSlug: form.sportSlug,
    openHour: form.useClubHours ? null : form.openHour,
    closeHour: form.useClubHours ? null : form.closeHour,
    audience: form.audience,
  }
}

const audienceOptions = COURT_AUDIENCE_VALUES

const submitLabel = computed(() => {
  if (props.bulkEdit) {
    return t('owner.settingsPage.submitBulkCourts', { count: props.bulkCount ?? 0 })
  }
  if (props.court) return t('common.save')
  if (form.count > 1) return t('owner.settingsPage.submitCourts', { count: form.count })
  return t('owner.settingsPage.submitCourt')
})

const canSubmit = computed(() => {
  if (props.bulkEdit) return true
  return Boolean(form.nameFa)
})

watch([() => props.court, () => props.bulkEdit], ([court]) => {
  form.applyPricingToAll = false
  bulkInitial = null
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
    form.audience = 'MIXED'
    form.notifyFutureBookings = false
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
  form.audience = parseCourtAudience(court.audience) || 'MIXED'
  form.notifyFutureBookings = false
  form.count = 1
  if (props.bulkEdit) {
    // Never pre-fill «ویرایش همه» with the first court's time bands: saving would
    // silently copy (or wipe) bands on every other court.
    form.pricingJson = null
    bulkInitial = currentBulkFields()
  }
}, { immediate: true })

function submit() {
  if (props.bulkEdit) {
    const patch = buildBulkCourtPatch({
      initial: bulkInitial ?? currentBulkFields(),
      current: currentBulkFields(),
      applyPricingToAll: form.applyPricingToAll,
      pricingJson: form.pricingJson,
    })
    if (!Object.keys(patch).length) {
      emit('cancel')
      return
    }
    emit('save', { ...patch, all: true })
    return
  }
  let count = 1
  if (!props.court) {
    try {
      count = parseCourtBulkCount(form.count ?? COURT_BULK_MIN)
    } catch {
      count = COURT_BULK_MIN
    }
  }
  const imagesJson = serializeImagesJson(form.images)
  emit('save', {
    nameFa: form.nameFa,
    nameEn: form.nameEn,
    price: form.price ?? 0,
    sportSlug: form.sportSlug,
    image: form.images[0] || null,
    imagesJson,
    openHour: form.useClubHours ? null : form.openHour,
    closeHour: form.useClubHours ? null : form.closeHour,
    // Only send time pricing when the owner changed it in this sheet.
    pricingJson: props.court && samePricingJson(form.pricingJson, props.court.pricingJson)
      ? undefined
      : form.pricingJson,
    audience: form.audience,
    notifyFutureBookings: Boolean(props.court && form.notifyFutureBookings),
    count,
  })
}

const openHourOptions = Array.from({ length: 24 }, (_, i) => i)
const closeHourOptions = Array.from({ length: 24 }, (_, i) => i + 1)
watch(() => form.useClubHours, (useClub) => {
  if (useClub) return
  if (form.openHour == null) form.openHour = props.clubOpenHour ?? 8
  if (form.closeHour == null) form.closeHour = props.clubCloseHour ?? 22
})
</script>

<template>
  <div class="canva-court-form space-y-4 text-start">
    <p v-if="bulkEdit" class="text-sm text-brand-gray-600">{{ t('owner.settingsPage.bulkEditCourtsHint', { count: bulkCount ?? 0 }) }}</p>

    <div v-if="!bulkEdit" class="grid grid-cols-2 gap-2">
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
        <AppNumericInput v-model="form.price" :min="0" />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.courtSport') }}</span>
        <select v-model="form.sportSlug" class="neo-select">
          <option value="padel">{{ t('clubs.sportPadel') }}</option>
          <option value="tennis">{{ t('clubs.sportTennis') }}</option>
        </select>
      </label>
    </div>

    <div>
      <p class="mb-1.5 text-sm font-bold">{{ t('owner.settingsPage.courtAudience') }}</p>
      <div class="canva-audience-seg" role="radiogroup" :aria-label="t('owner.settingsPage.courtAudience')">
        <button
          v-for="option in audienceOptions"
          :key="option"
          type="button"
          role="radio"
          class="canva-audience-seg-btn"
          :class="{ 'canva-audience-seg-btn-on': form.audience === option }"
          :aria-checked="form.audience === option"
          @click="form.audience = option"
        >
          {{ t(`owner.settingsPage.audience.${option}`) }}
        </button>
      </div>
    </div>

    <label v-if="!court" class="block text-sm">
      <span class="mb-1 block font-bold">{{ t('owner.settingsPage.courtCount') }}</span>
      <AppNumericInput
        v-model="form.count"
        :min="COURT_BULK_MIN"
        :max="COURT_BULK_MAX"
      />
      <span class="mt-1 block text-xs text-brand-gray-600">{{ t('owner.settingsPage.courtCountHint') }}</span>
    </label>

    <label class="canva-settings-check">
      <input v-model="form.useClubHours" type="checkbox" class="canva-settings-checkbox">
      <span>{{ t('owner.settingsPage.useClubHours') }}</span>
    </label>
    <div v-if="!form.useClubHours" class="grid grid-cols-2 gap-2">
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.openHour') }}</span>
        <select v-model.number="form.openHour" class="neo-select">
          <option v-for="h in openHourOptions" :key="`o-${h}`" :value="h">{{ String(h).padStart(2, '0') }}:00</option>
        </select>
      </label>
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.closeHour') }}</span>
        <select v-model.number="form.closeHour" class="neo-select">
          <option v-for="h in closeHourOptions" :key="`c-${h}`" :value="h">{{ String(h).padStart(2, '0') }}:00</option>
        </select>
      </label>
    </div>

    <label v-if="bulkEdit" class="canva-settings-check">
      <input v-model="form.applyPricingToAll" type="checkbox" class="canva-settings-checkbox" data-testid="bulk-apply-pricing">
      <span>
        <span class="font-bold">{{ t('owner.settingsPage.bulkApplyPricing') }}</span>
        <span class="mt-0.5 block text-xs font-normal text-brand-gray-600">{{ t('owner.settingsPage.bulkApplyPricingHint') }}</span>
      </span>
    </label>

    <OwnerCourtPricingTimeline
      v-if="!bulkEdit || form.applyPricingToAll"
      :key="bulkEdit ? 'bulk' : (court?.id ?? 'new')"
      v-model="form.pricingJson"
      :base-price="form.price"
      :open-hour="form.useClubHours ? clubOpenHour : (form.openHour ?? clubOpenHour)"
      :close-hour="form.useClubHours ? clubCloseHour : (form.closeHour ?? clubCloseHour)"
    />

    <OwnerPhotoSlots v-if="!bulkEdit" v-model="form.images" :max="4" />

    <label v-if="court && !bulkEdit" class="canva-settings-check">
      <input v-model="form.notifyFutureBookings" type="checkbox" class="canva-settings-checkbox">
      <span>{{ t('owner.settingsPage.notifyFutureBookings') }}</span>
    </label>

    <div class="space-y-2 pt-1">
      <button
        type="button"
        class="canva-owner-save-cta"
        :disabled="saving || !canSubmit"
        @click="submit"
      >
        {{ saving ? t('common.loading') : submitLabel }}
      </button>
      <button
        v-if="court && !bulkEdit"
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
