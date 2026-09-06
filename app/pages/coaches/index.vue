<script setup lang="ts">
import { translateCoachSpecialty } from '#shared/coachSpecialty.ts'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatNumber } = useFormatters()
const showFilters = ref(false)

const filters = reactive({
  city: (route.query.city as string) || '',
  specialty: (route.query.specialty as string) || '',
  sort: (route.query.sort as string) || 'rank',
  verified: route.query.verified === 'true',
})

const { data: coaches, pending, error } = await useFetch('/api/coaches', {
  query: computed(() => ({
    sport: route.query.sport as string | undefined,
    city: filters.city || undefined,
    specialty: filters.specialty || undefined,
    sort: filters.sort || undefined,
    verified: filters.verified ? 'true' : undefined,
  })),
})

const cityOptions = [
  { value: 'تهران', key: 'tehran' },
  { value: 'اصفهان', key: 'isfahan' },
  { value: 'شیراز', key: 'shiraz' },
] as const
const specialtyOptions = ['Padel basics', 'Match tactics', 'Match prep', 'Serve', 'Women coaching', 'Backhand'] as const

const cityChips = computed(() => [
  { value: '', label: t('clubs.allCities') },
  ...cityOptions.map((city) => ({ value: city.value, label: t(`clubs.cityOptions.${city.key}`) })),
])

function specialtyLabel(value: string) {
  return translateCoachSpecialty(t, value)
}

function formatSpecialties(values?: string[]) {
  return values?.slice(0, 2).map(specialtyLabel).join(' · ')
}

function coachMeta(c: { city?: string; rating?: number | null; reviewCount?: number }) {
  const city = c.city || 'تهران'
  if (c.reviewCount && c.rating != null) {
    return `${city} · ${formatNumber(c.rating)} ★`
  }
  return `${city} · ${t('coaches.noReviewsYet')}`
}

async function setCity(value: string) {
  filters.city = value
  await syncRoute()
}

async function setSort(value: string) {
  filters.sort = value
  await syncRoute()
}

async function syncRoute() {
  await router.replace({
    query: {
      ...route.query,
      city: filters.city || undefined,
      specialty: filters.specialty || undefined,
      sort: filters.sort || undefined,
      verified: filters.verified ? 'true' : undefined,
    },
  })
}

useHead({
  title: () => t('coaches.title'),
})
</script>

<template>
  <div class="tail-page-stack animate-fade-in">
    <CanvaPublicChrome back-to="/" />

    <div class="canva-clubs-chip-row">
      <button
        v-for="chip in cityChips"
        :key="chip.value || 'all'"
        type="button"
        class="canva-clubs-chip"
        :class="filters.city === chip.value ? 'canva-clubs-chip-active' : 'canva-clubs-chip-idle'"
        @click="setCity(chip.value)"
      >
        {{ chip.label }}
      </button>
      <button
        type="button"
        class="canva-clubs-chip"
        :class="showFilters ? 'canva-clubs-chip-active' : 'canva-clubs-chip-idle'"
        @click="showFilters = !showFilters"
      >
        {{ t('clubs.moreFilters') }}
      </button>
    </div>

    <div v-if="showFilters" class="canva-panel grid gap-3 lg:grid-cols-3">
      <select v-model="filters.specialty" class="neo-select" @change="syncRoute()">
        <option value="">{{ t('coaches.allSpecialties') }}</option>
        <option v-for="option in specialtyOptions" :key="option" :value="option">{{ specialtyLabel(option) }}</option>
      </select>
      <label class="flex items-center gap-2 text-sm font-bold text-brand-navy">
        <input v-model="filters.verified" type="checkbox" class="accent-brand-primary" @change="syncRoute()" />
        {{ t('clubs.verifiedOnly') }}
      </label>
    </div>

    <section class="space-y-3">
      <div class="canva-clubs-section-head">
        <div class="canva-clubs-section-copy">
          <h1 class="canva-clubs-section-title">{{ t('coaches.title') }}</h1>
          <p class="canva-clubs-section-subtitle">{{ t('home.coachSectionBody') }}</p>
        </div>
        <label class="canva-clubs-sort">
          <span>{{ t('clubs.sortLabel') }}</span>
          <AppIcon name="sort" size="sm" />
          <select
            :value="filters.sort"
            class="canva-clubs-sort-select"
            @change="setSort(($event.target as HTMLSelectElement).value)"
          >
            <option value="rank">{{ t('clubs.sort.rank') }}</option>
            <option value="rating">{{ t('clubs.sort.rating') }}</option>
            <option value="price">{{ t('clubs.sort.price') }}</option>
          </select>
        </label>
      </div>

      <AppAsyncState :pending="pending" :error="error" :empty="!coaches?.length" skeleton-variant="table">
        <div class="canva-court-card-grid">
          <NuxtLink
            v-for="c in coaches"
            :key="c.id"
            :to="localePath(`/coaches/${c.slug || c.id}`)"
            class="canva-court-card"
          >
            <img
              :src="c.photo || '/placeholders/coach.svg'"
              :alt="localizedField(c, 'nameFa', 'nameEn')"
              loading="lazy"
              decoding="async"
            />
            <div class="canva-court-card-body">
              <div class="canva-court-card-copy">
                <p class="canva-court-card-title">
                  {{ localizedField(c, 'nameFa', 'nameEn') }}
                  <span v-if="c.verified" class="ms-1 text-[10px] font-bold text-white/80">{{ t('clubs.verified') }}</span>
                </p>
                <p class="canva-court-card-meta">{{ coachMeta(c) }}</p>
                <p v-if="c.specialties?.length" class="canva-court-card-desc">{{ formatSpecialties(c.specialties) }}</p>
                <p class="canva-court-card-price">{{ formatCurrency(c.sessionPrice) }}</p>
              </div>
              <span class="canva-court-card-cta">{{ t('home.coachCta') }}</span>
            </div>
          </NuxtLink>
        </div>
      </AppAsyncState>
    </section>
  </div>
</template>
