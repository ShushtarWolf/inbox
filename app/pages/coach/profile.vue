<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' , ssr: false})

const { fetch } = useAuth()
const { data, pending, error, refresh } = await useAuthedFetch('/api/coach/profile')
const { data: clubs } = await useFetch<Array<{ id: string; nameFa: string; nameEn: string; city: string }>>('/api/clubs/options')

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
      <AppImageUpload v-model="photo" :label="$t('coach.photoUrl')" />
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
      <AppFormField :label="$t('owner.packagePage.coachPlaceholder')">
        <input v-model.number="price" type="number" min="0" dir="ltr" class="neo-input tabular-nums" />
      </AppFormField>
      <section class="ios-card p-4 space-y-3">
        <h2 class="font-bold">{{ $t('coaches.availability') }}</h2>
        <div class="flex flex-wrap gap-2 text-xs">
          <span v-for="item in data?.availability || []" :key="item.id" class="rounded-full border px-3 py-1 flex items-center gap-2">
            {{ $t('coach.dayLabel', { day: item.dayOfWeek }) }} · {{ item.startTime }} - {{ item.endTime }}
            <button type="button" class="text-red-600" @click="removeAvailability(item.id)">×</button>
          </span>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <input v-model.number="newDay" type="number" min="0" max="6" class="neo-input tabular-nums" />
          <input v-model="newStart" type="time" dir="ltr" class="neo-input tabular-nums" />
          <input v-model="newEnd" type="time" dir="ltr" class="neo-input tabular-nums" />
        </div>
        <button type="button" class="btn-secondary w-full" @click="addAvailability">{{ $t('common.add') }}</button>
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
