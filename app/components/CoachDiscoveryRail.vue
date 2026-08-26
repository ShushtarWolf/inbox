<script setup lang="ts">
import { translateCoachSpecialty } from '#shared/coachSpecialty.ts'

type CoachRailItem = {
  id: string
  slug?: string
  nameFa: string
  nameEn?: string
  city?: string
  photo?: string | null
  sessionPrice: number
  rating?: number | null
  reviewCount?: number
  specialties?: string[]
}

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const { pilotNoCoach } = usePilotFlags()

const { data: coaches } = await useFetch<CoachRailItem[]>('/api/coaches', {
  query: { sort: 'rank' },
  immediate: !pilotNoCoach.value,
  default: () => [],
})

const items = computed(() => (coaches.value || []).slice(0, 3))
const visible = computed(() => !pilotNoCoach.value)

function coachHref(coach: CoachRailItem) {
  return localePath(`/coaches/${coach.slug || coach.id}`)
}

function coachMeta(coach: CoachRailItem) {
  const city = coach.city || 'تهران'
  if (coach.reviewCount && coach.rating != null) {
    return `${city} · ${coach.rating.toFixed(1)} ★`
  }
  return city
}

function specialtyLine(coach: CoachRailItem) {
  const first = coach.specialties?.[0]
  if (!first) return ''
  return translateCoachSpecialty(t, first)
}
</script>

<template>
  <section v-if="visible" class="space-y-3">
    <div class="flex items-end justify-between gap-3">
      <div class="text-start">
        <h2 class="text-lg font-bold text-brand-primary">{{ t('home.coachSectionTitle') }}</h2>
        <p class="text-xs text-brand-gray-600">{{ t('home.coachSectionBody') }}</p>
      </div>
      <NuxtLink
        :to="localePath('/coaches')"
        class="inline-flex items-center gap-0.5 text-xs font-medium text-brand-gray-600"
      >
        {{ t('home.seeAll') }}
        <AppIcon name="chevron_left" size="sm" />
      </NuxtLink>
    </div>

    <div v-if="items.length" class="canva-coach-grid">
      <NuxtLink
        v-for="coach in items"
        :key="coach.id"
        :to="coachHref(coach)"
        class="canva-coach-card"
      >
        <img
          :src="coach.photo || '/placeholders/coach.svg'"
          :alt="localizedField(coach, 'nameFa', 'nameEn')"
          loading="lazy"
          decoding="async"
        />
        <div class="canva-coach-card-body">
          <div class="canva-coach-card-copy">
            <p class="canva-coach-card-title">{{ localizedField(coach, 'nameFa', 'nameEn') }}</p>
            <p class="canva-coach-card-meta">{{ coachMeta(coach) }}</p>
            <p v-if="specialtyLine(coach)" class="canva-coach-card-meta">{{ specialtyLine(coach) }}</p>
          </div>
          <span class="canva-coach-card-cta">{{ t('home.coachCta') }}</span>
        </div>
      </NuxtLink>
    </div>

    <CanvaEmptyState
      v-else
      :title="t('competitions.comingSoon')"
      icon="sports"
    />
  </section>
</template>
