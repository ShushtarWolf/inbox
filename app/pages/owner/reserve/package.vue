<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' })

const localePath = useLocalePath()
const route = useRoute()
const { t } = useI18n()
const { data: coaches } = await useAuthedFetch('/api/coaches')
const { data: equipments, refresh: refreshEquipments } = await useAuthedFetch('/api/owner/equipments')
useOwnerClubRefresh(refreshEquipments)
const { localizedField } = useLocalizedField()

const weekdayOptions = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const timeOptions = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00']

const form = reactive({
  guestName: '',
  guestFamily: '',
  guestMobile: '',
  coachId: '',
  days: ['Sun'] as string[],
  times: ['12:00'],
  equipmentId: '',
  comments: '',
  slotId: '',
})

function applyQuery() {
  const query = route.query
  if (typeof query.guestName === 'string') form.guestName = query.guestName
  if (typeof query.guestFamily === 'string') form.guestFamily = query.guestFamily
  if (typeof query.guestMobile === 'string') form.guestMobile = query.guestMobile
  if (typeof query.comments === 'string') form.comments = query.comments
  if (typeof query.slotId === 'string') form.slotId = query.slotId
}

onMounted(applyQuery)
watch(() => route.query, applyQuery)

function toggleDay(day: string) {
  if (form.days.includes(day)) {
    form.days = form.days.filter((item) => item !== day)
  } else {
    form.days = [...form.days, day]
  }
}

async function submit() {
  await $fetch('/api/owner/package-reserve', {
    method: 'POST',
    body: {
      guestName: form.guestName,
      guestFamily: form.guestFamily,
      guestMobile: form.guestMobile,
      coachId: form.coachId,
      days: form.days,
      times: form.times,
      comments: form.comments,
      slotId: form.slotId || undefined,
      equipmentId: form.equipmentId || undefined,
    },
  })
  await navigateTo(localePath('/owner'))
}

const rentalEquipments = computed(() =>
  (equipments.value || []).filter((item: { category: string }) => item.category === 'CLUB' || item.category === 'RENTAL'),
)
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4">
    <PageHeaderNav :title="t('owner.packagePage.title')" :home-to="localePath('/')" :back-to="localePath('/owner')" />
    <div class="space-y-3 rounded-2xl border border-black/5 bg-white p-4 shadow-card">
      <select v-model="form.coachId" class="w-full rounded-xl border px-3 py-2">
        <option value="">{{ t('owner.packagePage.coachPlaceholder') }}</option>
        <option v-for="c in coaches" :key="c.id" :value="c.id">{{ localizedField(c, 'nameFa', 'nameEn') }}</option>
      </select>
      <input v-model="form.guestName" :placeholder="t('owner.guestName')" class="w-full rounded-xl border px-3 py-2">
      <input v-model="form.guestFamily" :placeholder="t('owner.guestFamily')" class="w-full rounded-xl border px-3 py-2">
      <input v-model="form.guestMobile" :placeholder="t('owner.guestMobile')" dir="ltr" class="w-full rounded-xl border px-3 py-2 tabular-nums">

      <div>
        <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.packagesPage.weekdays') }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="day in weekdayOptions"
            :key="day"
            type="button"
            class="rounded-full border px-3 py-1 text-xs font-bold"
            :class="form.days.includes(day) ? 'border-brand-primary bg-brand-cream text-brand-primary' : 'border-black/10 text-brand-gray-600'"
            @click="toggleDay(day)"
          >
            {{ t(`owner.weekdays.${day}`) }}
          </button>
        </div>
      </div>

      <select v-model="form.times[0]" class="w-full rounded-xl border px-3 py-2">
        <option v-for="time in timeOptions" :key="time" :value="time">{{ time }}</option>
      </select>

      <select v-model="form.equipmentId" class="w-full rounded-xl border px-3 py-2">
        <option value="">{{ t('owner.packagesPage.equipmentPlaceholder') }}</option>
        <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ localizedField(item, 'nameFa', 'nameEn') }}</option>
      </select>

      <button type="button" class="btn-primary w-full" @click="submit">{{ t('common.save') }}</button>
    </div>
  </div>
</template>
