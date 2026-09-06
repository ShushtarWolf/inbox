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
  <div class="venus-page-stack">
    <CanvaCoachPhotoHero />
    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <h1 class="mb-0 text-start text-base font-bold text-brand-navy min-[431px]:text-xl min-[431px]:leading-snug">
        {{ $t('nav.profile') }}
      </h1>

      <div class="min-h-[2.75rem]">
        <RoleDashboardSwitcher current="COACH" />
      </div>

      <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
        <div class="venus-form-stack">
          <section class="canva-panel space-y-3">
            <h2 class="text-start text-sm font-bold text-brand-navy">{{ $t('coach.photoUrl') }}</h2>
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
          </section>

          <section class="canva-panel space-y-3">
            <h2 class="text-start text-sm font-bold text-brand-navy">{{ $t('coaches.availability') }}</h2>
            <div v-if="data?.availability?.length" class="flex flex-col gap-2">
              <article
                v-for="item in data.availability"
                :key="item.id"
                class="canva-finance-tx-card"
              >
                <div class="min-w-0 flex-1 text-start">
                  <p class="text-sm font-bold text-brand-navy">{{ weekdayLabel(item.dayOfWeek) }}</p>
                  <p class="mt-0.5 text-xs font-medium text-brand-gray-600 tabular-nums">
                    <bdi dir="ltr">{{ formatTimeRange(item.startTime, item.endTime) }}</bdi>
                  </p>
                </div>
                <button
                  type="button"
                  class="canva-cal-date-select shrink-0 text-red-600"
                  :aria-label="$t('common.delete')"
                  @click="removeAvailability(item.id)"
                >
                  {{ $t('common.delete') }}
                </button>
              </article>
            </div>
            <p v-else class="text-start text-xs text-brand-gray-600">{{ $t('coach.noAvailability') }}</p>
            <div class="grid grid-cols-3 gap-2">
              <select v-model="newDayKey" class="neo-select">
                <option v-for="day in weekdayOptions" :key="day" :value="day">
                  {{ $t(`owner.weekdays.${day}`) }}
                </option>
              </select>
              <input v-model="newStart" type="time" dir="ltr" class="neo-input tabular-nums" />
              <input v-model="newEnd" type="time" dir="ltr" class="neo-input tabular-nums" />
            </div>
            <button type="button" class="canva-owner-secondary-cta" @click="addAvailability">
              {{ $t('common.add') }}
            </button>
          </section>

          <section class="canva-panel space-y-3">
            <h2 class="text-start text-sm font-bold text-brand-navy">{{ $t('register.clubGallery') }}</h2>
            <div v-if="data?.media?.length" class="canva-photo-slots" role="list">
              <div
                v-for="item in data.media"
                :key="item.id"
                class="canva-photo-slot"
                role="listitem"
              >
                <img :src="item.url" alt="" class="canva-photo-slot-media" />
                <button
                  type="button"
                  class="canva-photo-slot-plus !bg-white text-red-600"
                  :aria-label="$t('common.delete')"
                  @click="removeGalleryImage(item.id)"
                >
                  ×
                </button>
              </div>
            </div>
            <p v-else class="canva-photo-slots-hint text-start">{{ $t('upload.addPhoto') }}</p>
            <AppImageUpload v-model="galleryUrl" />
            <button
              type="button"
              class="canva-owner-secondary-cta"
              :disabled="!galleryUrl"
              @click="addGalleryImage(galleryUrl)"
            >
              {{ $t('upload.addPhoto') }}
            </button>
          </section>

          <button type="button" class="canva-gate-btn-primary" @click="save">
            {{ $t('common.save') }}
          </button>
        </div>
      </AppAsyncState>
    </div>
  </div>
</template>
