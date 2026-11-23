<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { formatCurrency, formatIsoDate, formatFaDigits } = useFormatters()
const { localizedField } = useLocalizedField()
const { openMatchEnabled } = usePilotFlags()
const { fetchErrorMessage } = useFetchError()

const sportFilter = ref('all')
const paymentFilter = ref('all')

const { data: skills, refresh: refreshSkills } = useAuthedFetch<Array<{
  sportId: string
  rating: number
  labelFa: string
  assessmentStatus?: string
}>>(
  '/api/athlete/skill-ratings',
  { immediate: openMatchEnabled.value, lazy: true },
)

const { data, pending, error, refresh } = useAuthedFetch<Array<{
  id: string
  status: string
  paymentMode: string
  matchType: string
  maxPlayers: number
  minLevel: number | null
  maxLevel: number | null
  openSpots: number
  pricePerPlayer: number
  note: string | null
  club: { slug: string, nameFa: string, nameEn?: string, city: string }
  sport: { id: string, nameFa: string, nameEn?: string }
  slot: { date: string, startTime: string, endTime: string }
  participants: Array<{ user: { id: string, name: string, nameFamily?: string | null } }>
}>>('/api/open-matches', { immediate: openMatchEnabled.value, lazy: true })

const showPending = useHeldPending(pending, { forceRelease: () => Boolean(error.value) })

const sports = computed(() => {
  const rows = data.value || []
  const map = new Map<string, string>()
  for (const row of rows) map.set(row.sport.id, row.sport.nameFa)
  return [...map.entries()].map(([id, nameFa]) => ({ id, nameFa }))
})

const filtered = computed(() => {
  let rows = data.value || []
  if (sportFilter.value !== 'all') rows = rows.filter((r) => r.sport.id === sportFilter.value)
  if (paymentFilter.value !== 'all') rows = rows.filter((r) => r.paymentMode === paymentFilter.value)
  return rows
})

const headlineSkill = computed(() => skills.value?.[0])

const { data: sportCatalog } = useFetch<Array<{ id: string, slug: string, nameFa: string }>>(
  '/api/sports',
  { lazy: true },
)

const showAssess = ref(false)
const showSportPick = ref(false)

const defaultAssessSport = computed(() => {
  const catalog = sportCatalog.value || []
  if (!catalog.length) return null
  const rated = new Set((skills.value || []).map((s) => s.sportId))
  return catalog.find((s) => !rated.has(s.id)) || catalog[0]!
})

const assessSport = ref<{ id: string, slug: string, nameFa: string } | null>(null)

function openAssessFlow() {
  const catalog = sportCatalog.value || []
  if (catalog.length <= 1) {
    assessSport.value = defaultAssessSport.value
    showAssess.value = Boolean(assessSport.value)
    return
  }
  showSportPick.value = true
}

function pickAssessSport(sport: { id: string, slug: string, nameFa: string }) {
  assessSport.value = sport
  showSportPick.value = false
  showAssess.value = true
}

async function onAssessDone() {
  await Promise.all([refreshSkills(), refresh()])
  showAssess.value = false
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-lg font-bold text-brand-navy">
        {{ t('openMatch.title') }}
      </h1>
      <div class="flex flex-wrap gap-2">
        <button
          v-if="openMatchEnabled"
          type="button"
          class="border border-brand-primary bg-white px-3 py-2 text-sm font-bold text-brand-primary"
          @click="openAssessFlow"
        >
          {{ headlineSkill ? t('openMatch.reassessSkill') : t('openMatch.assessSkillCta') }}
        </button>
        <NuxtLink
          :to="localePath('/athlete/open-match/new')"
          class="bg-brand-primary px-3 py-2 text-sm font-bold text-white"
        >
          {{ t('openMatch.createCta') }}
        </NuxtLink>
      </div>
    </div>

    <div
      v-if="headlineSkill"
      class="flex items-center gap-2 border border-brand-gray-200 bg-brand-gold-soft px-3 py-2 text-sm text-brand-navy"
    >
      <span>{{ t('openMatch.yourLevel') }}</span>
      <span class="bg-white px-2 py-0.5 tabular-nums">{{ formatFaDigits(String(headlineSkill.rating)) }}</span>
      <span class="text-brand-gray-500">({{ headlineSkill.labelFa }})</span>
    </div>

    <CanvaEmptyState
      v-if="!openMatchEnabled"
      :title="t('openMatch.comingSoon')"
      icon="groups"
    />

    <template v-else>
      <div class="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          class="border border-brand-gray-200 px-3 py-1"
          :class="sportFilter === 'all' ? 'bg-brand-gold-soft text-brand-navy' : 'bg-white text-brand-gray-500'"
          @click="sportFilter = 'all'"
        >
          {{ t('openMatch.filterSportAll') }}
        </button>
        <button
          v-for="s in sports"
          :key="s.id"
          type="button"
          class="border border-brand-gray-200 px-3 py-1"
          :class="sportFilter === s.id ? 'bg-brand-gold-soft text-brand-navy' : 'bg-white text-brand-gray-500'"
          @click="sportFilter = s.id"
        >
          {{ s.nameFa }}
        </button>
      </div>
      <div class="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          class="border border-brand-gray-200 px-3 py-1"
          :class="paymentFilter === 'all' ? 'bg-brand-gold-soft text-brand-navy' : 'bg-white text-brand-gray-500'"
          @click="paymentFilter = 'all'"
        >
          {{ t('openMatch.filterPaymentAll') }}
        </button>
        <button
          type="button"
          class="border border-brand-gray-200 px-3 py-1"
          :class="paymentFilter === 'HOST_PAYS' ? 'bg-brand-gold-soft text-brand-navy' : 'bg-white text-brand-gray-500'"
          @click="paymentFilter = 'HOST_PAYS'"
        >
          {{ t('openMatch.paymentHost') }}
        </button>
        <button
          type="button"
          class="border border-brand-gray-200 px-3 py-1"
          :class="paymentFilter === 'SPLIT_ONLINE' ? 'bg-brand-gold-soft text-brand-navy' : 'bg-white text-brand-gray-500'"
          @click="paymentFilter = 'SPLIT_ONLINE'"
        >
          {{ t('openMatch.paymentSplit') }}
        </button>
      </div>

      <p v-if="error" class="text-sm text-brand-primary">
        {{ fetchErrorMessage(error) }}
      </p>

      <CanvaEmptyState
        v-if="!showPending && !(filtered?.length)"
        :title="t('openMatch.noMatches')"
        icon="groups"
      />

      <div v-if="showPending" class="text-sm text-brand-gray-500">
        …
      </div>

      <div v-else class="space-y-3">
        <article
          v-for="row in filtered || []"
          :key="row.id"
          class="border border-brand-gray-200 bg-white p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold text-brand-navy">
                {{ localizedField(row.club, 'name') }}
              </h2>
              <span class="inline-block bg-brand-gold-soft px-2 py-0.5 text-xs text-brand-navy">
                {{ localizedField(row.sport, 'name') }}
              </span>
              <p class="text-sm text-brand-gray-500">
                <bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(row.slot.date) }}</bdi>
                <bdi dir="ltr" class="tabular-nums">{{ row.slot.startTime }}</bdi>
              </p>
              <p v-if="row.minLevel != null && row.maxLevel != null" class="text-xs text-brand-gray-500">
                {{ t('openMatch.levelRange', {
                  min: formatFaDigits(String(row.minLevel)),
                  max: formatFaDigits(String(row.maxLevel)),
                }) }}
              </p>
            </div>
            <span class="text-xs text-brand-gray-500">
              {{ t('openMatch.openSpots', { count: formatFaDigits(String(row.openSpots)) }) }}
            </span>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span class="bg-brand-gold-soft px-2 py-1 text-brand-navy">
              {{ row.paymentMode === 'HOST_PAYS' ? t('openMatch.paymentHost') : t('openMatch.paymentSplit') }}
            </span>
            <span class="text-brand-gray-500">
              {{ row.matchType === 'COMPETITIVE' ? t('openMatch.competitive') : t('openMatch.friendly') }}
            </span>
            <span v-if="row.paymentMode === 'SPLIT_ONLINE'" class="tabular-nums text-brand-navy">
              {{ t('openMatch.pricePerPlayer') }}: {{ formatCurrency(row.pricePerPlayer) }}
            </span>
          </div>

          <NuxtLink
            :to="localePath(`/athlete/open-match/${row.id}`)"
            class="mt-3 inline-flex bg-brand-primary px-4 py-2 text-sm font-medium text-white"
          >
            {{ t('openMatch.join') }}
          </NuxtLink>
        </article>
      </div>
    </template>

    <AppModal
      :open="showSportPick"
      :title="t('skillAssess.pickSport')"
      @close="showSportPick = false"
    >
      <ul class="space-y-2">
        <li v-for="sport in sportCatalog || []" :key="sport.id">
          <button
            type="button"
            class="w-full border border-brand-gray-200 px-3 py-2 text-start text-sm font-bold text-brand-navy hover:border-brand-primary"
            @click="pickAssessSport(sport)"
          >
            {{ sport.nameFa }}
          </button>
        </li>
      </ul>
    </AppModal>

    <SkillAssessmentWizard
      v-if="assessSport"
      :open="showAssess"
      :sport-id="assessSport.id"
      :sport-slug="assessSport.slug"
      :sport-name-fa="assessSport.nameFa"
      @close="showAssess = false"
      @done="onAssessDone"
    />
  </div>
</template>