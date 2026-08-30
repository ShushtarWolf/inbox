<script setup lang="ts">
import {
  IRAN_WEEKDAY_ORDER,
  dayOfWeekFromWeekdayKey,
  weekdayKeyFromDayOfWeek,
} from '#shared/recurringSessions.ts'

definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' , ssr: false})

const { t } = useI18n()
const { fetch } = useAuth()
const { formatTimeRange } = useFormatters()
const { data, pending, error, refresh } = await useAuthedFetch<{
  bioFa?: string | null
  bioEn?: string | null
  sessionPrice: number
  photo?: string | null
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
  credentialsJson?: string | null
  availability?: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>
  media?: Array<{ id: string; url: string }>
}>('/api/coach/profile')

const weekdayOptions = IRAN_WEEKDAY_ORDER

function weekdayLabel(dayOfWeek: number) {
  return t(`owner.weekdays.${weekdayKeyFromDayOfWeek(dayOfWeek)}`)
}

const bioFa = ref('')
const bioEn = ref('')
const price = ref(0)
const photo = ref('')
const credentialsText = ref('')
const newDayKey = ref<(typeof IRAN_WEEKDAY_ORDER)[number]>('Mon')
const newStart = ref('09:00')
const newEnd = ref('17:00')
const galleryUrl = ref('')

const savingPhoto = ref(false)

watch(data, (d) => {
  if (d) {
    bioFa.value = d.bioFa || ''
    bioEn.value = d.bioEn || ''
    price.value = d.sessionPrice
    photo.value = d.photo || ''
    credentialsText.value = (() => {
      try {
        return (d.credentialsJson ? JSON.parse(d.credentialsJson) : []).join('\n')
      } catch {
        return ''
      }
    })()
  }
}, { immediate: true })

async function persistPhoto(url: string) {
  savingPhoto.value = true
  try {
    await $fetch('/api/coach/profile', {
      method: 'PATCH',
      body: { photo: url || null },
    })
    await fetch()
    refresh()
  } finally {
    savingPhoto.value = false
  }
}

async function onPhotoChange(url: string) {
  photo.value = url
  await persistPhoto(url)
}

async function save() {
  const credentials = credentialsText.value.split('\n').map((line) => line.trim()).filter(Boolean)
  await $fetch('/api/coach/profile', {
    method: 'PATCH',
    body: {
      bioFa: bioFa.value,
      bioEn: bioEn.value,
      sessionPrice: price.value,
      photo: photo.value || null,
      credentials,
    },
  })
  await fetch()
  refresh()
}

async function addAvailability() {
  await $fetch('/api/coach/availability', {
    method: 'POST',
    body: {
      dayOfWeek: dayOfWeekFromWeekdayKey(newDayKey.value),
      startTime: newStart.value,
      endTime: newEnd.value,
    },
  })
  refresh()
}

async function removeAvailability(id: string) {
  await $fetch(`/api/coach/availability/${id}`, { method: 'DELETE' })
  refresh()
}

async function addGalleryImage(url: string) {
  if (!url) return
  await $fetch('/api/coach/media', { method: 'POST', body: { url } })
  galleryUrl.value = ''
  refresh()
}

async function removeGalleryImage(id: string) {
  await $fetch(`/api/coach/media/${id}`, { method: 'DELETE' })
  refresh()
}
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ $t('nav.profile') }}</h1>
    <div class="mb-4">
      <RoleDashboardSwitcher current="COACH" />
    </div>
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
    <div class="venus-form-stack">
      <AppImageUpload crop :model-value="photo" :label="$t('coach.photoUrl')" @update:model-value="onPhotoChange" />
      <p v-if="savingPhoto" class="text-xs text-brand-gray-600">{{ $t('upload.uploading') }}</p>

      <AppFormField :label="$t('coach.bioFa')">
        <textarea v-model="bioFa" class="neo-textarea" rows="3" />
      </AppFormField>
      <AppFormField :label="$t('coach.bioEn')">
        <textarea v-model="bioEn" class="neo-textarea" rows="3" dir="ltr" />
      </AppFormField>
      <AppFormField :label="$t('coaches.credentials')">
        <textarea v-model="credentialsText" class="neo-textarea" rows="3" :placeholder="$t('register.credentialsHint')" />
      </AppFormField>
      <AppFormField :label="$t('owner.packagePage.coachPlaceholder')" numeric>
        <AppNumericInput v-model="price" :min="0" />
      </AppFormField>
      <section class="ios-card space-y-3 p-4">
        <h2 class="font-bold">{{ $t('coaches.availability') }}</h2>
        <div v-if="data?.availability?.length" class="overflow-hidden border border-brand-gray-100">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-brand-gray-100 bg-brand-gray-50 text-xs text-brand-gray-600">
                <th class="px-3 py-2 text-start font-bold">{{ $t('coach.availabilityDay') }}</th>
                <th class="px-3 py-2 text-start font-bold">{{ $t('coach.availabilityHours') }}</th>
                <th class="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in data.availability"
                :key="item.id"
                class="border-b border-brand-gray-100 last:border-b-0"
              >
                <td class="px-3 py-2 font-medium text-brand-navy">{{ weekdayLabel(item.dayOfWeek) }}</td>
                <td class="px-3 py-2 tabular-nums">
                  <bdi dir="ltr">{{ formatTimeRange(item.startTime, item.endTime) }}</bdi>
                </td>
                <td class="px-2 py-2 text-center">
                  <button type="button" class="text-red-600" :aria-label="$t('common.delete')" @click="removeAvailability(item.id)">×</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-xs text-brand-gray-600">{{ $t('coach.noAvailability') }}</p>
        <div class="grid grid-cols-3 gap-2">
          <select v-model="newDayKey" class="neo-select">
            <option v-for="day in weekdayOptions" :key="day" :value="day">
              {{ $t(`owner.weekdays.${day}`) }}
            </option>
          </select>
          <input v-model="newStart" type="time" dir="ltr" class="neo-input tabular-nums" />
          <input v-model="newEnd" type="time" dir="ltr" class="neo-input tabular-nums" />
        </div>
        <button type="button" class="btn-secondary w-full" @click="addAvailability">{{ $t('common.add') }}</button>
      </section>

      <section class="ios-card space-y-3 p-4">
        <h2 class="font-bold">{{ $t('register.clubGallery') }}</h2>
        <div class="flex flex-wrap gap-2">
          <div v-for="item in data?.media || []" :key="item.id" class="relative">
            <img :src="item.url" alt="" class="h-20 w-20 border object-cover" />
            <button type="button" class="mt-1 block text-xs text-red-600" @click="removeGalleryImage(item.id)">
              {{ $t('common.delete') }}
            </button>
          </div>
        </div>
        <AppImageUpload v-model="galleryUrl" />
        <button type="button" class="btn-secondary w-full" :disabled="!galleryUrl" @click="addGalleryImage(galleryUrl)">
          {{ $t('upload.addPhoto') }}
        </button>
      </section>

      <button type="button" class="btn-primary w-full" @click="save">{{ $t('common.save') }}</button>
    </div>
    </AppAsyncState>
  </div>
</template>
