<script setup lang="ts">
import { COURT_FACILITY_OPTIONS, parseFacilitiesJson } from '#shared/courtFacilities.ts'

const props = defineProps<{
  court?: {
    id: string
    nameFa: string
    nameEn: string
    price: number
    image?: string | null
    openHour?: number | null
    closeHour?: number | null
    facilitiesJson?: string | null
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
const { localizedField } = useLocalizedField()

const form = reactive({
  nameFa: '',
  nameEn: '',
  price: 600000,
  sportSlug: 'padel',
  image: '',
  openHour: null as number | null,
  closeHour: null as number | null,
  facilities: [] as string[],
  useClubHours: true,
})

watch(() => props.court, (court) => {
  if (!court) {
    form.nameFa = ''
    form.nameEn = ''
    form.price = 600000
    form.sportSlug = 'padel'
    form.image = ''
    form.openHour = null
    form.closeHour = null
    form.facilities = []
    form.useClubHours = true
    return
  }
  form.nameFa = court.nameFa
  form.nameEn = court.nameEn
  form.price = court.price
  form.sportSlug = court.sport?.slug || 'padel'
  form.image = court.image || ''
  form.openHour = court.openHour ?? null
  form.closeHour = court.closeHour ?? null
  form.facilities = parseFacilitiesJson(court.facilitiesJson)
  form.useClubHours = court.openHour == null && court.closeHour == null
}, { immediate: true })

function toggleFacility(slug: string) {
  if (form.facilities.includes(slug)) {
    form.facilities = form.facilities.filter((item) => item !== slug)
  } else {
    form.facilities = [...form.facilities, slug]
  }
}

function submit() {
  emit('save', {
    nameFa: form.nameFa,
    nameEn: form.nameEn,
    price: form.price,
    sportSlug: form.sportSlug,
    image: form.image || null,
    openHour: form.useClubHours ? null : form.openHour,
    closeHour: form.useClubHours ? null : form.closeHour,
    facilitiesJson: JSON.stringify(form.facilities),
  })
}
</script>

<template>
  <div class="venus-form-stack">
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.courtNameFa') }}</span>
        <input v-model="form.nameFa" required class="neo-input">
      </label>
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.courtNameEn') }}</span>
        <input v-model="form.nameEn" required dir="ltr" class="neo-input">
      </label>
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.courtPrice') }}</span>
        <input v-model.number="form.price" type="number" min="0" dir="ltr" class="neo-input tabular-nums">
      </label>
      <label class="block text-sm">
        <span class="mb-1 block font-bold">{{ t('owner.settingsPage.courtSport') }}</span>
        <select v-model="form.sportSlug" class="neo-select">
          <option value="padel">Padel</option>
          <option value="tennis">Tennis</option>
        </select>
      </label>
    </div>
    <AppImageUpload v-model="form.image" :label="t('owner.settingsPage.courtImage')" placeholder="/placeholders/club.svg" />
    <label class="flex items-center gap-2 text-sm">
      <input v-model="form.useClubHours" type="checkbox" class="rounded">
      <span class="font-bold">{{ t('owner.settingsPage.useClubHours') }}</span>
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
    <div>
      <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.settingsPage.courtFacilities') }}</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="facility in COURT_FACILITY_OPTIONS"
          :key="facility.slug"
          type="button"
          class="neo-pill"
          :class="form.facilities.includes(facility.slug) ? 'neo-pill-active' : 'neo-pill-inactive'"
          @click="toggleFacility(facility.slug)"
        >
          {{ localizedField(facility, 'nameFa', 'nameEn') }}
        </button>
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn-primary" :disabled="saving || !form.nameFa" @click="submit">
        {{ saving ? t('common.loading') : t('common.save') }}
      </button>
      <button v-if="court" type="button" class="btn-secondary text-red-600" :disabled="saving" @click="emit('delete', court.id)">
        {{ t('common.delete') }}
      </button>
      <button type="button" class="btn-ghost" @click="emit('cancel')">{{ t('common.cancel') }}</button>
    </div>
  </div>
</template>
