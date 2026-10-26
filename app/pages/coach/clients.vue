<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t } = useI18n()
const { formatPhone, formatIsoDate, formatTimeLabel, formatCurrency, formatNumber } = useFormatters()

type ClientRow = {
  id: string
  name: string
  phone: string
  nextSessionDate: string | null
  nextSessionTime: string | null
  upcomingCount: number
  unpaidDue: number
}

const { data, pending, error } = await useAuthedFetch<{
  clients?: ClientRow[]
}>('/api/coach/clients')

const query = ref('')
type StudentFilter = 'all' | 'low' | 'due'
const filter = ref<StudentFilter>('all')

const filters = computed<Array<{ key: StudentFilter; label: string }>>(() => [
  { key: 'all', label: t('coach.studentsFilterAll') },
  { key: 'low', label: t('coach.studentsFilterLow') },
  { key: 'due', label: t('coach.studentsFilterDue') },
])

const visibleClients = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (data.value?.clients || []).filter((c) => {
    if (filter.value === 'low' && c.upcomingCount > 1) return false
    if (filter.value === 'due' && c.unpaidDue <= 0) return false
    if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q)) return false
    return true
  })
})
</script>

<template>
  <div class="venus-page-stack">
    <CanvaCoachPhotoHero />
    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <h1 class="mb-0 text-start text-base font-bold text-brand-navy min-[431px]:text-xl min-[431px]:leading-snug">
        {{ t('coach.clients') }}
      </h1>

      <div class="mt-3 space-y-2">
        <label for="coach-students-search" class="sr-only">{{ t('coach.studentsSearchPlaceholder') }}</label>
        <input
          id="coach-students-search"
          v-model="query"
          type="search"
          class="neo-input w-full"
          :placeholder="t('coach.studentsSearchPlaceholder')"
        >
        <div class="canva-clubs-chip-row" role="group">
          <button
            v-for="item in filters"
            :key="item.key"
            type="button"
            class="canva-clubs-chip"
            :class="filter === item.key ? 'canva-clubs-chip-active' : 'canva-clubs-chip-idle'"
            :aria-pressed="filter === item.key"
            @click="filter = item.key"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <AppAsyncState :pending="pending" :error="error" :empty="!data?.clients?.length" skeleton-variant="table">
        <p v-if="!visibleClients.length" class="py-4 text-center text-sm text-brand-gray-600">
          {{ t('coach.studentsNoMatch') }}
        </p>
        <div v-else class="flex flex-col gap-2">
          <article
            v-for="c in visibleClients"
            :key="c.id"
            class="canva-finance-tx-card"
          >
            <div class="min-w-0 flex-1 text-start">
              <p class="text-sm font-bold text-brand-navy">{{ c.name }}</p>
              <p class="mt-0.5 text-xs font-medium text-brand-gray-600">
                <bdi dir="ltr" class="tabular-nums">{{ formatPhone(c.phone) }}</bdi>
              </p>
              <p v-if="c.nextSessionDate" class="mt-0.5 text-[11px] text-brand-gray-500">
                {{ t('coach.nextSession') }}:
                <bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(c.nextSessionDate) }} · {{ formatTimeLabel(c.nextSessionTime || '') }}</bdi>
              </p>
              <p v-else class="mt-0.5 text-[11px] text-brand-gray-500">{{ t('coach.studentsNoNext') }}</p>
              <p class="mt-1 flex flex-wrap gap-1.5">
                <span class="coach-dash-tag coach-dash-tag-green">{{ t('coach.studentsUpcomingCount', { count: formatNumber(c.upcomingCount) }) }}</span>
                <span v-if="c.unpaidDue > 0" class="coach-dash-tag coach-dash-tag-mustard">{{ t('coach.studentsUnpaidDue', { amount: formatCurrency(c.unpaidDue) }) }}</span>
              </p>
            </div>
          </article>
        </div>
      </AppAsyncState>
    </div>
  </div>
</template>
