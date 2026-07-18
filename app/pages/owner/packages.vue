<script setup lang="ts">
import {
  ensureDayTimesForDays,
  hasValidDayTimes,
  serializeDayTimes,
  type DayTimeRange,
} from '#shared/recurringSessions.ts'
import { buildHourlyOptions } from '#shared/courtFacilities.ts'
import { isPastDate } from '#shared/localDate.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const { formatCurrency, formatIsoDate } = useFormatters()
const { pilotNoCoach } = usePilotFlags()
const { data: staffData } = await useAuthedFetch('/api/owner/staff')
const { data: equipments } = await useAuthedFetch('/api/owner/equipments')
const { data: settingsData } = await useAuthedFetch('/api/owner/settings')
const { data: packages, pending, error, refresh } = await useAuthedFetch('/api/owner/packages')
useOwnerClubRefresh(refresh)
const { localizedField } = useLocalizedField()

const saving = ref(false)
const createError = ref('')

const clubCoaches = computed(() =>
  pilotNoCoach.value
    ? []
    : (staffData.value?.staff || [])
        .filter((member: { coach?: { id: string } | null }) => member.coach)
        .map((member: { coach: { id: string; nameFa: string; nameEn: string } }) => member.coach),
)

const weekdayOptions = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const levelOptions = [1, 2, 3, 4, 5]

const sessionDurationMinutes = computed(() => settingsData.value?.club?.defaultSessionDurationMinutes ?? 60)
const scheduleTimeOptions = computed(() => {
  const open = settingsData.value?.club?.openHour ?? 8
  const close = settingsData.value?.club?.closeHour ?? 22
  return buildHourlyOptions(open, close, sessionDurationMinutes.value)
})

const form = reactive({
  title: '',
  capacity: 8,
  price: 0,
  discount: 0,
  level: 3,
  coachId: '',
  comment: '',
  startDate: '',
  finishDate: '',
  days: ['Sun'] as string[],
  dayTimes: {} as Record<string, DayTimeRange>,
  equipmentId: '',
})

const draftPlayers = ref<Array<{ guestName: string; guestMobile: string; level: number }>>([])
const newPlayer = reactive({ guestName: '', guestMobile: '', level: 3 })

const spotsRemaining = computed(() => Math.max(0, form.capacity - draftPlayers.value.length))

function toggleDay(day: string) {
  if (form.days.includes(day)) {
    form.days = form.days.filter((item) => item !== day)
  } else {
    form.days = [...form.days, day]
  }
  const fallback = Object.values(form.dayTimes)[0] || { start: '18:00', end: '19:00' }
  form.dayTimes = ensureDayTimesForDays(form.dayTimes, form.days, fallback)
}

function packageDays(pkg: { daysJson?: string | null }) {
  try {
    const parsed = JSON.parse(pkg.daysJson || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function packageSchedule(pkg: { daysJson?: string | null; timesJson?: string | null }) {
  const days = packageDays(pkg)
  if (!days.length) return ''
  let times: Record<string, { start?: string }> = {}
  try {
    times = JSON.parse(pkg.timesJson || '{}')
  } catch {
    times = {}
  }
  return days
    .map((day: string) => {
      const start = times[day]?.start
      return start ? `${t(`owner.weekdays.${day}`)} ${start}` : t(`owner.weekdays.${day}`)
    })
    .join(' · ')
}

function coachName(coachId?: string | null) {
  if (!coachId) return null
  const coach = clubCoaches.value?.find((item: { id: string }) => item.id === coachId)
  return coach ? localizedField(coach, 'nameFa', 'nameEn') : null
}

function addDraftPlayer() {
  if (!newPlayer.guestName.trim()) return
  if (spotsRemaining.value <= 0) return
  draftPlayers.value.push({
    guestName: newPlayer.guestName.trim(),
    guestMobile: newPlayer.guestMobile.trim(),
    level: newPlayer.level,
  })
  newPlayer.guestName = ''
  newPlayer.guestMobile = ''
  newPlayer.level = 3
}

function removeDraftPlayer(index: number) {
  draftPlayers.value.splice(index, 1)
}

const dateRangeInvalid = computed(() =>
  Boolean(form.startDate && form.finishDate && form.finishDate < form.startDate),
)
const startDateInPast = computed(() =>
  Boolean(form.startDate && isPastDate(form.startDate)),
)

const scheduleValid = computed(() => hasValidDayTimes(form.dayTimes, form.days))

async function create() {
  if (dateRangeInvalid.value) {
    createError.value = t('owner.packagesPage.dateRangeInvalid')
    return
  }
  if (startDateInPast.value) {
    createError.value = t('owner.errors.startDateInPast')
    return
  }
  saving.value = true
  createError.value = ''
  try {
    const created = await $fetch<{ id: string }>('/api/owner/packages', {
      method: 'POST',
      body: {
        title: form.title,
        capacity: form.capacity,
        price: form.price,
        discount: form.discount,
        level: form.level,
        coachId: pilotNoCoach.value ? undefined : (form.coachId || undefined),
        comment: form.comment,
        startDate: form.startDate || undefined,
        finishDate: form.finishDate || undefined,
        daysJson: JSON.stringify(form.days),
        timesJson: serializeDayTimes(form.dayTimes),
        equipmentId: form.equipmentId || undefined,
      },
    })
    for (const player of draftPlayers.value) {
      await $fetch(`/api/owner/packages/${created.id}/players`, {
        method: 'POST',
        body: player,
      })
    }
    form.title = ''
    form.comment = ''
    form.days = ['Sun']
    form.dayTimes = ensureDayTimesForDays({}, ['Sun'], { start: '18:00', end: '19:00' })
    draftPlayers.value = []
    await refresh()
  } catch {
    createError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  form.dayTimes = ensureDayTimesForDays({}, form.days, { start: '18:00', end: '19:00' })
})

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
        <p v-if="!pilotNoCoach && coachName(p.coachId)" class="mt-1 text-xs text-brand-gray-600">{{ coachName(p.coachId) }}</p>
        <p v-if="p.level" class="mt-1 text-xs text-brand-gray-600">{{ '★'.repeat(p.level) }}</p>
        <p class="mt-2 text-sm font-bold">{{ formatCurrency(p.price) }}</p>
        <p v-if="packageSchedule(p)" class="mt-1 text-xs text-brand-gray-600">{{ packageSchedule(p) }}</p>
        <p v-if="p.startDate" class="mt-1 text-xs text-brand-gray-600" dir="auto">{{ formatIsoDate(p.startDate) }} – {{ p.finishDate ? formatIsoDate(p.finishDate) : '…' }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">
          {{ (p._count?.bookings || 0) + (p._count?.players || 0) }} / {{ p.capacity }}
        </p>
      </div>
      <div class="flex min-w-[6rem] items-center justify-center ios-card border-dashed px-4 py-6 text-2xl font-bold text-brand-navy">+</div>
    </div>
    <div class="mx-auto max-w-lg venus-form-stack ios-card p-4">
      <h2 class="font-bold">{{ t('owner.packagesPage.createTitle') }}</h2>
      <AppFormField :label="t('owner.packagesPage.title')" required>
        <input v-model="form.title" class="neo-input">
      </AppFormField>
      <AppFormField v-if="!pilotNoCoach" :label="t('owner.packagesPage.coachPlaceholder')">
        <select v-model="form.coachId" class="neo-select">
          <option value="">{{ t('owner.packagesPage.coachPlaceholder') }}</option>
          <option v-for="c in clubCoaches" :key="c.id" :value="c.id">{{ localizedField(c, 'nameFa', 'nameEn') }}</option>
        </select>
      </AppFormField>
      <AppFormField :label="t('owner.packagesPage.packageLevel')">
        <div class="flex gap-2">
          <button
            v-for="star in levelOptions"
            :key="star"
            type="button"
            class="neo-pill"
            :class="form.level === star ? 'neo-pill-active' : 'neo-pill-inactive'"
            @click="form.level = star"
          >
            {{ '★'.repeat(star) }}
          </button>
        </div>
      </AppFormField>
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
      <OwnerDayTimeSchedules
        v-model:day-times="form.dayTimes"
        :days="form.days"
        :options="scheduleTimeOptions"
      />
      <AppDateRangeInput
        v-model:start="form.startDate"
        v-model:end="form.finishDate"
        :invalid="dateRangeInvalid || startDateInPast"
        :invalid-message="startDateInPast ? t('owner.errors.startDateInPast') : t('owner.packagesPage.dateRangeInvalid')"
      />
      <AppFormField :label="t('owner.packagesPage.capacity')">
        <input v-model.number="form.capacity" type="number" min="1" class="neo-input">
      </AppFormField>
      <AppFormField :label="t('owner.packagesPage.price')">
        <input v-model.number="form.price" type="number" min="0" dir="ltr" class="neo-input tabular-nums">
      </AppFormField>
      <AppFormField :label="t('owner.packagesPage.equipmentPlaceholder')">
        <select v-model="form.equipmentId" class="neo-select">
          <option value="">{{ t('owner.packagesPage.equipmentPlaceholder') }}</option>
          <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ localizedField(item, 'nameFa', 'nameEn') }}</option>
        </select>
      </AppFormField>
      <AppFormField :label="t('owner.packagesPage.discount')">
        <input v-model.number="form.discount" type="number" min="0" dir="ltr" class="neo-input tabular-nums">
      </AppFormField>
      <div class="rounded-venus border border-brand-gray-100 p-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-bold">{{ t('owner.packagesPage.players') }}</h3>
          <span class="text-xs font-bold text-brand-primary">{{ t('owner.packagesPage.spotsRemaining', { count: spotsRemaining }) }}</span>
        </div>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <input v-model="newPlayer.guestName" class="neo-input" :placeholder="t('owner.guestName')">
          <input v-model="newPlayer.guestMobile" dir="ltr" class="neo-input tabular-nums" :placeholder="t('owner.guestMobile')">
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <button
            v-for="star in levelOptions"
            :key="`player-${star}`"
            type="button"
            class="neo-pill text-xs"
            :class="newPlayer.level === star ? 'neo-pill-active' : 'neo-pill-inactive'"
            @click="newPlayer.level = star"
          >
            {{ '★'.repeat(star) }}
          </button>
          <button type="button" class="btn-secondary text-xs" :disabled="!newPlayer.guestName || spotsRemaining <= 0" @click="addDraftPlayer">
            {{ t('owner.packagesPage.addPlayer') }}
          </button>
        </div>
        <ul v-if="draftPlayers.length" class="mt-3 space-y-2">
          <li v-for="(player, index) in draftPlayers" :key="index" class="flex items-center justify-between gap-2 text-sm">
            <span>{{ player.guestName }} <span class="text-brand-gray-600"><bdi dir="ltr">{{ player.guestMobile }}</bdi> · {{ '★'.repeat(player.level) }}</span></span>
            <button type="button" class="text-xs text-red-600" @click="removeDraftPlayer(index)">{{ t('common.delete') }}</button>
          </li>
        </ul>
      </div>
      <AppFormField :label="t('owner.comments')">
        <textarea v-model="form.comment" class="neo-textarea" rows="3" />
      </AppFormField>
      <p v-if="createError" class="text-sm text-red-600">{{ createError }}</p>
      <button type="button" class="btn-primary venus-sticky-action w-full" :disabled="saving || !form.title || !scheduleValid" @click="create">{{ saving ? t('common.loading') : t('owner.packagesPage.saveStub') }}</button>
    </div>
    </AppAsyncState>
  </div>
</template>
