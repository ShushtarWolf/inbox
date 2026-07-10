<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const { formatCurrency, formatIsoDate } = useFormatters()
const { data: staffData } = await useAuthedFetch('/api/owner/staff')
const { data: equipments } = await useAuthedFetch('/api/owner/equipments')
const { data: packages, pending, error, refresh } = await useAuthedFetch('/api/owner/packages')
useOwnerClubRefresh(refresh)
const { localizedField } = useLocalizedField()

const saving = ref(false)
const createError = ref('')

const clubCoaches = computed(() =>
  (staffData.value?.staff || [])
    .filter((member: { coach?: { id: string } | null }) => member.coach)
    .map((member: { coach: { id: string; nameFa: string; nameEn: string } }) => member.coach),
)

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
  const coach = clubCoaches.value?.find((item: { id: string }) => item.id === coachId)
  return coach ? localizedField(coach, 'nameFa', 'nameEn') : null
}

async function create() {
  saving.value = true
  createError.value = ''
  try {
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
    form.title = ''
    form.comment = ''
    await refresh()
  } catch {
    createError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

const rentalEquipments = computed(() =>
  (equipments.value || []).filter((item: { category: string }) => item.category === 'CLUB' || item.category === 'RENTAL'),
)
</script>

<template>
  <div class="venus-page-stack">
    <h1 class="font-display text-xl font-bold">{{ $t('owner.packages') }}</h1>
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="table">
    <div class="flex flex-wrap gap-3">
      <div
        v-for="p in packages"
        :key="p.id"
        class="venus-widget-card min-w-[10rem] px-4 py-4"
      >
        <p class="font-bold text-brand-primary">{{ p.title }}</p>
        <p v-if="coachName(p.coachId)" class="mt-1 text-xs text-brand-gray-600">{{ coachName(p.coachId) }}</p>
        <p class="mt-2 text-sm font-bold">{{ formatCurrency(p.price) }}</p>
        <p v-if="packageDays(p).length" class="mt-1 text-xs text-brand-gray-600">
          {{ packageDays(p).map((day: string) => t(`owner.weekdays.${day}`)).join(' · ') }}
        </p>
        <p v-if="p.startDate" class="mt-1 text-xs text-brand-gray-600" dir="auto">{{ formatIsoDate(p.startDate) }} – {{ p.finishDate ? formatIsoDate(p.finishDate) : '…' }}</p>
      </div>
      <div class="flex min-w-[6rem] items-center justify-center ios-card border-dashed px-4 py-6 text-2xl font-bold text-brand-navy">+</div>
    </div>
    <div class="mx-auto max-w-lg space-y-2 ios-card p-4">
      <h2 class="font-bold">{{ t('owner.packagesPage.createTitle') }}</h2>
      <input v-model="form.title" :placeholder="t('owner.packagesPage.title')" class="neo-input">
      <select v-model="form.coachId" class="neo-input">
        <option value="">{{ t('owner.packagesPage.coachPlaceholder') }}</option>
        <option v-for="c in clubCoaches" :key="c.id" :value="c.id">{{ localizedField(c, 'nameFa', 'nameEn') }}</option>
      </select>
      <div>
        <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.packagesPage.weekdays') }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="day in weekdayOptions"
            :key="day"
            type="button"
            class="neo-pill neo-pill-inactive"
            :class="form.days.includes(day) ? 'neo-pill-active' : 'neo-pill-inactive'"
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
      <input v-model.number="form.capacity" type="number" min="1" :placeholder="t('owner.packagesPage.capacity')" class="neo-input">
      <input v-model.number="form.price" type="number" :placeholder="t('owner.packagesPage.price')" class="neo-input">
      <select v-model="form.equipmentId" class="neo-input">
        <option value="">{{ t('owner.packagesPage.equipmentPlaceholder') }}</option>
        <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ localizedField(item, 'nameFa', 'nameEn') }}</option>
      </select>
      <input v-model.number="form.discount" type="number" :placeholder="t('owner.packagesPage.discount')" class="neo-input">
      <textarea v-model="form.comment" :placeholder="t('owner.comments')" class="neo-input" rows="2" />
      <p v-if="createError" class="text-sm text-red-600">{{ createError }}</p>
      <button type="button" class="btn-primary w-full" :disabled="saving || !form.title" @click="create">{{ saving ? t('common.loading') : t('owner.packagesPage.saveStub') }}</button>
    </div>
    </AppAsyncState>
  </div>
</template>
