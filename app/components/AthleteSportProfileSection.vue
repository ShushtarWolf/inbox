<script setup lang="ts">
import type { MatchOutcomeLetter } from '#shared/skillProfile.ts'

type SportProfile = {
  sportId: string
  sportSlug: string
  sportNameFa: string
  assessmentStatus: string
  rating: number
  labelFa: string
  descriptionFa: string
  reliabilityPercent: number
  nextTier: number
  progressToNextTier: number
  matchesPlayed: number
  wins: number
  losses: number
  draws: number
  winRate: number
  recentForm: MatchOutcomeLetter[]
  lastDelta: number
  progression: Array<{
    id: string
    createdAt: string
    rating: number
    delta: number
    reason: string
    matchId?: string | null
  }>
}

type RecentMatch = {
  id: string
  sportId: string
  sportNameFa: string
  clubNameFa: string
  courtNameFa: string | null
  date: string
  startTime: string
  outcome: MatchOutcomeLetter
  scoreSummary: string | null
  ratingDelta: number | null
  path: string
}

const props = defineProps<{
  sports: SportProfile[]
  recentMatches: RecentMatch[]
  pending?: boolean
}>()

const emit = defineEmits<{
  assess: [sport: { id: string, slug: string, nameFa: string } | null]
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { formatFaDigits, formatIsoDate, formatNumber } = useFormatters()

function formatRating(value: number) {
  return formatFaDigits(String(Math.round(value * 100) / 100))
}
const { openMatchEnabled } = usePilotFlags()

const selectedSportId = ref('')
const chartHover = ref<number | null>(null)

watch(
  () => props.sports,
  (rows) => {
    if (!selectedSportId.value && rows[0]) selectedSportId.value = rows[0].sportId
    if (rows.length && !rows.some((r) => r.sportId === selectedSportId.value)) {
      selectedSportId.value = rows[0]!.sportId
    }
  },
  { immediate: true },
)

const activeSport = computed(() => props.sports.find((s) => s.sportId === selectedSportId.value) || null)

const filteredMatches = computed(() =>
  activeSport.value
    ? props.recentMatches.filter((m) => m.sportId === activeSport.value!.sportId)
    : props.recentMatches,
)

function formClass(letter: MatchOutcomeLetter) {
  if (letter === 'W') return 'bg-brand-gold-soft text-brand-navy border-brand-gold'
  if (letter === 'L') return 'bg-brand-primary-soft text-brand-primary border-brand-primary/30'
  return 'bg-brand-gray-200 text-brand-gray-500 border-brand-gray-200'
}

function outcomeLabel(letter: MatchOutcomeLetter) {
  if (letter === 'W') return t('athleteSportProfile.win')
  if (letter === 'L') return t('athleteSportProfile.loss')
  if (letter === 'D') return t('athleteSportProfile.draw')
  return t('athleteSportProfile.pending')
}

const chartGeometry = computed(() => {
  const points = activeSport.value?.progression || []
  if (!points.length) return null
  const w = 320
  const h = 120
  const padX = 8
  const padY = 12
  const ratings = points.map((p) => p.rating)
  const minR = Math.max(1, Math.min(...ratings) - 0.3)
  const maxR = Math.min(7, Math.max(...ratings) + 0.3)
  const span = maxR - minR || 1
  const coords = points.map((p, i) => {
    const x = points.length === 1
      ? w / 2
      : padX + (i / (points.length - 1)) * (w - padX * 2)
    const y = padY + (1 - (p.rating - minR) / span) * (h - padY * 2)
    return { x, y, ...p }
  })
  const line = coords.map((c) => `${c.x},${c.y}`).join(' ')
  const area = `${coords[0]?.x || 0},${h} ${line} ${coords[coords.length - 1]?.x || 0},${h}`
  return { w, h, coords, line, area, minR, maxR }
})

const activePoint = computed(() => {
  if (!chartGeometry.value) return null
  const idx = chartHover.value
  if (idx == null) return chartGeometry.value.coords[chartGeometry.value.coords.length - 1] || null
  return chartGeometry.value.coords[idx] || null
})

function openAssessNew() {
  emit('assess', null)
}

function openAssessCurrent() {
  if (!activeSport.value) {
    openAssessNew()
    return
  }
  emit('assess', {
    id: activeSport.value.sportId,
    slug: activeSport.value.sportSlug,
    nameFa: activeSport.value.sportNameFa,
  })
}
</script>

<template>
  <section v-if="openMatchEnabled" class="mt-4 space-y-3 border border-brand-gray-200 bg-white p-4">
    <h2 class="text-start text-base font-bold text-brand-navy">
      {{ t('athleteSportProfile.title') }}
    </h2>

    <p v-if="pending" class="text-sm text-brand-gray-500">
      …
    </p>

    <template v-else-if="!sports.length">
      <p class="text-start text-sm text-brand-gray-500">
        {{ t('athleteSportProfile.unassessedHint') }}
      </p>
      <button
        type="button"
        class="w-full bg-brand-primary px-4 py-2 text-sm font-bold text-white"
        @click="openAssessNew"
      >
        {{ t('openMatch.assessSkillCta') }}
      </button>
    </template>

    <template v-else>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="sport in sports"
          :key="sport.sportId"
          type="button"
          class="border px-3 py-1 text-xs font-bold"
          :class="sport.sportId === selectedSportId
            ? 'border-brand-primary bg-brand-primary-soft text-brand-navy'
            : 'border-brand-gray-200 bg-white text-brand-gray-500'"
          @click="selectedSportId = sport.sportId"
        >
          {{ sport.sportNameFa }}
        </button>
        <button
          type="button"
          class="border border-dashed border-brand-primary px-3 py-1 text-xs font-bold text-brand-primary"
          @click="openAssessNew"
        >
          {{ t('athleteSportProfile.addSport') }}
        </button>
      </div>

      <div v-if="activeSport" class="space-y-4">
        <div class="border border-brand-gray-200 bg-brand-gold-soft/40 p-4">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="text-xs font-bold text-brand-gray-500">
                {{ t('athleteSportProfile.levelNumeric') }}
              </p>
              <p class="text-4xl font-bold tabular-nums text-brand-navy">
                {{ formatRating(activeSport.rating) }}
              </p>
              <p class="mt-1 text-sm font-bold text-brand-primary">
                {{ activeSport.labelFa }}
              </p>
            </div>
            <button
              type="button"
              class="border border-brand-primary bg-white px-3 py-1 text-xs font-bold text-brand-primary"
              @click="openAssessCurrent"
            >
              {{ t('openMatch.reassessSkill') }}
            </button>
          </div>
          <p class="mt-2 text-start text-xs leading-relaxed text-brand-navy">
            {{ activeSport.descriptionFa }}
          </p>

          <div class="mt-3 space-y-2">
            <div>
              <div class="mb-1 flex justify-between text-xs text-brand-gray-500">
                <span>{{ t('athleteSportProfile.progressLabel') }}</span>
                <span class="tabular-nums">
                  {{ formatFaDigits(String(activeSport.progressToNextTier)) }}٪ → {{ formatFaDigits(String(activeSport.nextTier)) }}
                </span>
              </div>
              <div class="h-2 bg-brand-gray-200">
                <div
                  class="h-full bg-brand-primary transition-all"
                  :style="{ width: `${activeSport.progressToNextTier}%` }"
                />
              </div>
            </div>
            <div>
              <div class="mb-1 flex justify-between text-xs text-brand-gray-500">
                <span>{{ t('athleteSportProfile.reliabilityLabel') }}</span>
                <span class="tabular-nums">{{ formatFaDigits(String(activeSport.reliabilityPercent)) }}٪</span>
              </div>
              <div class="h-2 bg-brand-gray-200">
                <div
                  class="h-full bg-brand-gold"
                  :style="{ width: `${activeSport.reliabilityPercent}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <div class="border border-brand-gray-200 p-2">
            <p class="text-lg font-bold tabular-nums text-brand-navy">{{ formatFaDigits(String(activeSport.matchesPlayed)) }}</p>
            <p class="text-xs text-brand-gray-500">{{ t('athleteSportProfile.matchesPlayed') }}</p>
          </div>
          <div class="border border-brand-gray-200 p-2">
            <p class="text-lg font-bold tabular-nums text-brand-navy">
              {{ formatFaDigits(String(activeSport.wins)) }} / {{ formatFaDigits(String(activeSport.losses)) }}
            </p>
            <p class="text-xs text-brand-gray-500">{{ t('athleteSportProfile.winLoss') }}</p>
          </div>
          <div class="border border-brand-gray-200 p-2">
            <p class="text-lg font-bold tabular-nums text-brand-navy">{{ formatFaDigits(String(activeSport.winRate)) }}٪</p>
            <p class="text-xs text-brand-gray-500">{{ t('athleteSportProfile.winRate') }}</p>
          </div>
          <div class="border border-brand-gray-200 p-2">
            <div class="flex justify-center gap-1">
              <span
                v-for="(letter, i) in activeSport.recentForm.length ? activeSport.recentForm : ['P']"
                :key="i"
                class="inline-flex h-6 w-6 items-center justify-center border text-[10px] font-bold"
                :class="formClass(letter as MatchOutcomeLetter)"
              >
                {{ letter }}
              </span>
            </div>
            <p class="mt-1 text-xs text-brand-gray-500">{{ t('athleteSportProfile.recentForm') }}</p>
          </div>
        </div>

        <div v-if="chartGeometry" class="border border-brand-gray-200 p-3">
          <p class="mb-2 text-start text-sm font-bold text-brand-navy">
            {{ t('athleteSportProfile.progressionChart') }}
          </p>
          <svg
            :viewBox="`0 0 ${chartGeometry.w} ${chartGeometry.h}`"
            class="h-auto w-full max-h-36"
            role="img"
            :aria-label="t('athleteSportProfile.progressionChart')"
          >
            <polygon
              :points="chartGeometry.area"
              fill="rgba(196, 30, 30, 0.08)"
            />
            <polyline
              :points="chartGeometry.line"
              fill="none"
              stroke="#C41E1E"
              stroke-width="2.5"
            />
            <!-- eslint-disable vuejs-accessibility/no-static-element-interactions -- SVG rating chart point hover -->
            <circle
              v-for="(c, idx) in chartGeometry.coords"
              :key="c.id"
              :cx="c.x"
              :cy="c.y"
              r="5"
              fill="#C41E1E"
              class="cursor-pointer"
              tabindex="-1"
              @mouseenter="chartHover = idx"
              @focus="chartHover = idx"
            />
            <!-- eslint-enable vuejs-accessibility/no-static-element-interactions -->
          </svg>
          <p v-if="activePoint" class="mt-1 text-start text-xs text-brand-gray-500">
            <bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(activePoint.createdAt.slice(0, 10)) }}</bdi>
            —
            <span class="font-bold text-brand-navy tabular-nums">{{ formatRating(activePoint.rating) }}</span>
            <span v-if="activePoint.delta" class="tabular-nums" :class="activePoint.delta > 0 ? 'text-brand-gold-dark' : 'text-brand-primary'">
              ({{ activePoint.delta > 0 ? '+' : '' }}{{ formatRating(activePoint.delta) }})
            </span>
          </p>
          <p v-else-if="activeSport.progression.length === 1" class="mt-1 text-xs text-brand-gray-500">
            {{ t('athleteSportProfile.singlePointHint') }}
          </p>
        </div>

        <div>
          <p class="mb-2 text-start text-sm font-bold text-brand-navy">
            {{ t('athleteSportProfile.recentMatches') }}
          </p>
          <ul v-if="filteredMatches.length" class="space-y-2">
            <li v-for="match in filteredMatches" :key="match.id">
              <NuxtLink
                :to="localePath(match.path)"
                class="flex items-center justify-between gap-2 border border-brand-gray-200 p-3 hover:border-brand-primary"
              >
                <div class="min-w-0 text-start">
                  <p class="truncate text-sm font-bold text-brand-navy">
                    {{ match.clubNameFa }}
                  </p>
                  <p class="text-xs text-brand-gray-500">
                    <bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(match.date) }}</bdi>
                    <span v-if="match.courtNameFa"> · {{ match.courtNameFa }}</span>
                  </p>
                </div>
                <div class="shrink-0 text-end text-xs">
                  <span
                    class="inline-block border px-2 py-0.5 font-bold"
                    :class="formClass(match.outcome)"
                  >
                    {{ outcomeLabel(match.outcome) }}
                  </span>
                  <p v-if="match.scoreSummary" class="mt-1 tabular-nums text-brand-navy" dir="ltr">
                    {{ match.scoreSummary }}
                  </p>
                  <p
                    v-if="match.ratingDelta != null"
                    class="mt-0.5 tabular-nums"
                    :class="match.ratingDelta > 0 ? 'text-brand-gold-dark' : match.ratingDelta < 0 ? 'text-brand-primary' : 'text-brand-gray-500'"
                  >
                    {{ match.ratingDelta > 0 ? '+' : '' }}{{ formatRating(match.ratingDelta) }}
                  </p>
                </div>
              </NuxtLink>
            </li>
          </ul>
          <div v-else class="border border-dashed border-brand-gray-200 p-4 text-center">
            <p class="text-sm text-brand-gray-500">
              {{ t('athleteSportProfile.noMatches') }}
            </p>
            <NuxtLink
              :to="localePath('/athlete/open-match')"
              class="mt-2 inline-block bg-brand-primary px-4 py-2 text-sm font-bold text-white"
            >
              {{ t('athleteSportProfile.findOpenMatch') }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>