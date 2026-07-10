<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const { formatCurrency } = useFormatters()
const { data: coaches } = await useAuthedFetch('/api/coaches')
const { data: equipments } = await useAuthedFetch('/api/owner/equipments')
const { data: packages, refresh } = await useAuthedFetch('/api/owner/packages')
useOwnerClubRefresh(refresh)
const { localizedField } = useLocalizedField()

const weekdayOptions = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const form = reactive({
  title: '',
  capacity: 8,
  price: 0,
  discount: 0,
  coachId: '',
  comment: '',
  startDate: '',
  finishDate: '',
  days: ['Sun'] as string[],
  equipmentId: '',
})

function toggleDay(day: string) {
  if (form.days.includes(day)) {
    form.days = form.days.filter((item) => item !== day)
  } else {
    form.days = [...form.days, day]
  }
}

function packageDays(pkg: { daysJson?: string | null }) {
  try {
    const parsed = JSON.parse(pkg.daysJson || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function coachName(coachId?: string | null) {
  if (!coachId) return null
  const coach = coaches.value?.find((item: { id: string }) => item.id === coachId)
  return coach ? localizedField(coach, 'nameFa', 'nameEn') : null
}

async function create() {
  await $fetch('/api/owner/packages', {
    method: 'POST',
    body: {
      title: form.title,
      capacity: form.capacity,
      price: form.price,
      discount: form.discount,
      coachId: form.coachId || undefined,
      comment: form.comment,
      startDate: form.startDate || undefined,
      finishDate: form.finishDate || undefined,
      daysJson: JSON.stringify(form.days),
      equipmentId: form.equipmentId || undefined,
    },
  })
  refresh()
}

const rentalEquipments = computed(() =>
  (equipments.value || []).filter((item: { category: string }) => item.category === 'CLUB' || item.category === 'RENTAL'),
)
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('owner.packages') }}</h1>
    <div class="flex flex-wrap gap-3">
      <div
        v-for="p in packages"
        :key="p.id"
        class="min-w-[10rem] rounded-xl border border-black/5 bg-brand-cream px-4 py-4 shadow-sm"
      >
        <p class="font-bold text-brand-primary">{{ p.title }}</p>
        <p v-if="coachName(p.coachId)" class="mt-1 text-xs text-brand-gray-600">{{ coachName(p.coachId) }}</p>
        <p class="mt-2 text-sm font-black">{{ formatCurrency(p.price) }}</p>
        <p v-if="packageDays(p).length" class="mt-1 text-xs text-brand-gray-600">
          {{ packageDays(p).map((day: string) => t(`owner.weekdays.${day}`)).join(' · ') }}
        </p>
        <p v-if="p.startDate" class="mt-1 text-xs text-brand-gray-600"><bdi dir="ltr" class="tabular-nums">{{ p.startDate }} – {{ p.finishDate || '…' }}</bdi></p>
      </div>
      <div class="flex min-w-[6rem] items-center justify-center rounded-xl border border-dashed border-brand-primary/30 bg-white px-4 py-6 text-2xl text-brand-primary">+</div>
    </div>
    <div class="mx-auto max-w-lg space-y-2 rounded-2xl border border-black/5 bg-white p-4">
      <h2 class="font-bold">{{ t('owner.packagesPage.createTitle') }}</h2>
      <input v-model="form.title" :placeholder="t('owner.packagesPage.title')" class="w-full rounded-xl border px-3 py-2">
      <select v-model="form.coachId" class="w-full rounded-xl border px-3 py-2">
        <option value="">{{ t('owner.packagesPage.coachPlaceholder') }}</option>
        <option v-for="c in coaches" :key="c.id" :value="c.id">{{ localizedField(c, 'nameFa', 'nameEn') }}</option>
      </select>
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
      <div class="grid gap-2 sm:grid-cols-2">
        <AppDateInput v-model="form.startDate" />
        <AppDateInput v-model="form.finishDate" />
      </div>
      <input v-model.number="form.capacity" type="number" min="1" :placeholder="t('owner.packagesPage.capacity')" class="w-full rounded-xl border px-3 py-2">
      <input v-model.number="form.price" type="number" :placeholder="t('owner.packagesPage.price')" class="w-full rounded-xl border px-3 py-2">
      <select v-model="form.equipmentId" class="w-full rounded-xl border px-3 py-2">
        <option value="">{{ t('owner.packagesPage.equipmentPlaceholder') }}</option>
        <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ localizedField(item, 'nameFa', 'nameEn') }}</option>
      </select>
      <input v-model.number="form.discount" type="number" :placeholder="t('owner.packagesPage.discount')" class="w-full rounded-xl border px-3 py-2">
      <textarea v-model="form.comment" :placeholder="t('owner.comments')" class="w-full rounded-xl border px-3 py-2" rows="2" />
      <button type="button" class="btn-primary w-full" @click="create">{{ t('owner.packagesPage.saveStub') }}</button>
    </div>
  </div>
</template>
