<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
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

function cityLabel(key: 'tehran' | 'isfahan' | 'shiraz') {
  return t(`clubs.cityOptions.${key}`)
}

function specialtyLabel(value: string) {
  return t(`coaches.specialtyOptions.${value}` as 'coaches.specialtyOptions.Padel basics')
}

function formatSpecialties(values?: string[]) {
  return values?.slice(0, 2).map(specialtyLabel).join(' · ')
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
</script>

<template>
  <div class="space-y-4">
    <PageHeaderNav :title="t('coaches.title')" :home-to="localePath('/')" />

    <button type="button" class="neo-pill neo-pill-inactive" @click="showFilters = !showFilters">{{ t('clubs.moreFilters') }}</button>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="neo-pill neo-pill-inactive" :class="filters.city === '' ? 'neo-pill-active' : ''" @click="filters.city = ''; syncRoute()">{{ t('clubs.allCities') }}</button>
      <button v-for="city in cityOptions" :key="city.value" type="button" class="neo-pill neo-pill-inactive" :class="filters.city === city.value ? 'neo-pill-active' : ''" @click="filters.city = city.value; syncRoute()">
        {{ cityLabel(city.key) }}
      </button>
    </div>
    <div v-if="showFilters" class="ios-card grid gap-3 p-4 lg:grid-cols-3">
      <select v-model="filters.specialty" class="neo-select" @change="syncRoute()">
        <option value="">{{ t('coaches.allSpecialties') }}</option>
        <option v-for="option in specialtyOptions" :key="option" :value="option">{{ specialtyLabel(option) }}</option>
      </select>
      <select v-model="filters.sort" class="neo-select" @change="syncRoute()">
        <option value="rank">{{ t('clubs.sort.rank') }}</option>
        <option value="rating">{{ t('clubs.sort.rating') }}</option>
        <option value="price">{{ t('clubs.sort.price') }}</option>
      </select>
      <label class="flex items-center gap-2 neo-select">
        <input v-model="filters.verified" type="checkbox" @change="syncRoute()" />
        {{ t('clubs.verifiedOnly') }}
      </label>
    </div>
    <AppVenusSkeleton v-if="pending" :lines="3" />
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>
    <p v-else-if="!coaches?.length" class="text-sm text-brand-gray-600">{{ t('common.empty') }}</p>

    <div v-else class="grid gap-4 lg:grid-cols-2">
      <NuxtLink
        v-for="c in coaches"
        :key="c.id"
        :to="localePath(`/coaches/${c.id}`)"
        class="ios-card flex items-center gap-3 p-3"
      >
        <img :src="c.photo || '/demo/coaches/coach-1.jpg'" alt="" class="h-14 w-14 border border-brand-gray-100 object-cover shadow-venus-sm" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <p class="font-bold">{{ localizedField(c, 'nameFa', 'nameEn') }}</p>
            <span v-if="c.verified" class="neo-badge">{{ t('clubs.verified') }}</span>
          </div>
          <p class="text-xs text-brand-gray-600">{{ c.city }} · ⭐ {{ c.rating }} · {{ c.reviewCount }} {{ t('clubs.reviews') }}</p>
          <p v-if="c.specialties?.length" class="truncate text-xs text-brand-gray-600">{{ formatSpecialties(c.specialties) }}</p>
          <p class="text-sm font-bold text-brand-primary">{{ formatCurrency(c.sessionPrice) }}</p>
        </div>
        <span class="neo-badge">{{ t('home.coachCta') }}</span>
      </NuxtLink>
    </div>
  </div>
</template>
