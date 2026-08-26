<script setup lang="ts">
type CompetitionRailItem = {
  id: string
  title: string
  entryFee: number
  eventAt: string
  spotsLeft: number
  isFull: boolean
  club: { slug: string; nameFa: string; nameEn?: string; city?: string; image?: string | null }
  sport: { slug: string; nameFa: string; nameEn?: string }
}

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatIsoDate } = useFormatters()
const { competitionsEnabled } = usePilotFlags()

const { data: competitions } = await useFetch<CompetitionRailItem[]>('/api/competitions', {
  query: { status: 'OPEN' },
  immediate: competitionsEnabled.value,
  default: () => [],
})

const items = computed(() => (competitions.value || []).slice(0, 3))
const visible = computed(() => competitionsEnabled.value)

function cardImage(item: CompetitionRailItem) {
  if (item.club.image) return item.club.image
  if (item.sport.slug === 'padel') return '/hero/padel-court.jpg'
  if (item.sport.slug === 'tennis') return '/hero/tennis-court.jpg'
  return '/hero/fitness-venue.jpg'
}

function cardMeta(item: CompetitionRailItem) {
  const club = localizedField(item.club, 'nameFa', 'nameEn')
  const city = item.club.city ? ` · ${item.club.city}` : ''
  return `${club}${city}`
}
</script>

<template>
  <section v-if="visible" class="space-y-3">
    <div class="flex items-end justify-between gap-3">
      <div class="text-start">
        <h2 class="text-lg font-bold text-[#B68A3B]">{{ t('home.competitionsRailTitle') }}</h2>
        <p class="text-xs text-brand-gray-600">{{ t('home.competitionsRailBody') }}</p>
      </div>
      <NuxtLink
        :to="localePath('/competitions')"
        class="inline-flex items-center gap-0.5 text-xs font-medium text-brand-gray-600"
      >
        {{ t('home.seeAll') }}
        <AppIcon name="chevron_left" size="sm" />
      </NuxtLink>
    </div>

    <div v-if="items.length" class="canva-competition-grid">
      <NuxtLink
        v-for="item in items"
        :key="item.id"
        :to="localePath(`/competitions/${item.id}`)"
        class="canva-competition-card"
      >
        <img :src="cardImage(item)" :alt="item.title" loading="lazy" decoding="async" />
        <span class="canva-competition-card-badge">
          <AppIcon name="emoji_events" size="sm" />
        </span>
        <div class="canva-competition-card-body">
          <div class="canva-competition-card-copy">
            <p class="canva-competition-card-title">{{ item.title }}</p>
            <p class="canva-competition-card-meta">{{ cardMeta(item) }}</p>
            <p class="canva-competition-card-meta">{{ formatIsoDate(item.eventAt) }}</p>
          </div>
          <span class="canva-competition-card-cta">
            {{
              item.entryFee > 0
                ? t('competitions.fee', { amount: formatCurrency(item.entryFee) })
                : t('competitions.freeEntry')
            }}
          </span>
        </div>
      </NuxtLink>
    </div>

    <CanvaEmptyState
      v-else
      :title="t('competitions.comingSoon')"
      icon="emoji_events"
    />
  </section>
</template>
