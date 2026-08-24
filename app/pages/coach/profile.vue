<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' , ssr: false})

const { fetch } = useAuth()
const { formatTimeRange } = useFormatters()
const { data, pending, error, refresh } = await useAuthedFetch<{
  bioFa?: string | null
  bioEn?: string | null
  sessionPrice: number
  photo?: string | null
  clubId?: string | null
  credentialsJson?: string | null
  availability?: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>
  media?: Array<{ id: string; url: string }>
}>('/api/coach/profile')
const { data: clubs } = await useFetch<Array<{ id: string; nameFa: string; nameEn: string; city: string }>>('/api/clubs/options')

type ClubOption = { id: string; nameFa: string; nameEn: string; city: string }
const { data: clubLinks, refresh: refreshClubLinks } = await useAuthedFetch<{
  links: Array<{ id: string; status: 'PENDING' | 'ACTIVE' | 'BLOCKED'; courtDiscountPercent: number; club: ClubOption }>
  availableClubs: ClubOption[]
}>('/api/coach/clubs')

const linkClubId = ref('')
const linkBusy = ref(false)

async function requestClubLink() {
  if (!linkClubId.value || linkBusy.value) return
  linkBusy.value = true
  try {
    await $fetch('/api/coach/clubs', { method: 'POST', body: { clubId: linkClubId.value } })
    linkClubId.value = ''
    await refreshClubLinks()
  } finally {
    linkBusy.value = false
  }
}

async function removeClubLink(id: string) {
  if (linkBusy.value) return
  linkBusy.value = true
  try {
    await $fetch(`/api/coach/clubs/${id}`, { method: 'DELETE' })
    await refreshClubLinks()
  } finally {
    linkBusy.value = false
  }
}

const bioFa = ref('')
const bioEn = ref('')
const price = ref(0)
const photo = ref('')
const clubId = ref('')
const credentialsText = ref('')
const newDay = ref(1)
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
    clubId.value = d.clubId || ''
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
      clubId: clubId.value || undefined,
      credentials,
    },
  })
  await fetch()
  refresh()
}

async function addAvailability() {
  await $fetch('/api/coach/availability', {
    method: 'POST',
    body: { dayOfWeek: newDay.value, startTime: newStart.value, endTime: newEnd.value },
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
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
    <div class="venus-form-stack">
      <AppImageUpload crop :model-value="photo" :label="$t('coach.photoUrl')" @update:model-value="onPhotoChange" />
      <p v-if="savingPhoto" class="text-xs text-brand-gray-600">{{ $t('upload.uploading') }}</p>
      <AppFormField :label="$t('register.selectClub')">
        <select v-model="clubId" class="neo-select">
          <option value="">{{ $t('register.selectClubPlaceholder') }}</option>
          <option v-for="club in clubs || []" :key="club.id" :value="club.id">
            {{ club.nameFa }} — {{ club.city }}
          </option>
        </select>
      </AppFormField>
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
      <section class="ios-card p-4 space-y-3">
        <h2 class="font-bold">{{ $t('coaches.availability') }}</h2>
        <div class="flex flex-wrap gap-2 text-xs">
          <span v-for="item in data?.availability || []" :key="item.id" class="rounded-full border px-3 py-1 flex items-center gap-2">
            {{ $t('coach.dayLabel', { day: item.dayOfWeek }) }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(item.startTime, item.endTime) }}</bdi>
            <button type="button" class="text-red-600" @click="removeAvailability(item.id)">×</button>
          </span>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <AppNumericInput v-model="newDay" :min="0" :max="6" />
          <input v-model="newStart" type="time" dir="ltr" class="neo-input tabular-nums" />
          <input v-model="newEnd" type="time" dir="ltr" class="neo-input tabular-nums" />
        </div>
        <button type="button" class="btn-secondary w-full" @click="addAvailability">{{ $t('common.add') }}</button>
      </section>

      <section class="ios-card p-4 space-y-3">
        <h2 class="font-bold">{{ $t('coach.clubLinksTitle') }}</h2>
        <p class="text-xs text-brand-gray-600">{{ $t('coach.clubLinksHint') }}</p>
        <ul class="space-y-2 text-sm">
          <li v-for="link in clubLinks?.links || []" :key="link.id" class="flex items-start justify-between gap-2 border p-2">
            <div>
              <p class="font-bold">{{ link.club.nameFa }}</p>
              <p class="text-xs text-brand-gray-600">
                {{ $t(`owner.coachLinkStatus.${link.status}`) }}
                <template v-if="link.status === 'ACTIVE'">
                  · {{ $t('coach.clubLinkDiscount', { percent: link.courtDiscountPercent }) }}
                </template>
              </p>
            </div>
            <button type="button" class="text-xs text-red-600" :disabled="linkBusy" @click="removeClubLink(link.id)">
              {{ $t('common.delete') }}
            </button>
          </li>
          <li v-if="!clubLinks?.links?.length" class="text-xs text-brand-gray-600">{{ $t('coach.clubLinksEmpty') }}</li>
        </ul>
        <div class="flex gap-2">
          <select v-model="linkClubId" class="neo-select flex-1">
            <option value="">{{ $t('register.selectClubPlaceholder') }}</option>
            <option v-for="club in clubLinks?.availableClubs || []" :key="club.id" :value="club.id">
              {{ club.nameFa }} — {{ club.city }}
            </option>
          </select>
          <button type="button" class="btn-secondary px-4" :disabled="!linkClubId || linkBusy" @click="requestClubLink">
            {{ $t('common.add') }}
          </button>
        </div>
      </section>

      <section class="ios-card p-4 space-y-3">
        <h2 class="font-bold">{{ $t('register.clubGallery') }}</h2>
        <div class="flex flex-wrap gap-2">
          <div v-for="item in data?.media || []" :key="item.id" class="relative">
            <img :src="item.url" alt="" class="h-20 w-20 object-cover border" />
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
