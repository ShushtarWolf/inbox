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

const { data: coaches } = await useFetch('/api/coaches', {
  query: computed(() => ({
    sport: route.query.sport as string | undefined,
    city: filters.city || undefined,
    specialty: filters.specialty || undefined,
    sort: filters.sort || undefined,
    verified: filters.verified ? 'true' : undefined,
  })),
})

const cityOptions = ['تهران', 'اصفهان', 'شیراز']
const specialtyOptions = ['Padel basics', 'Match tactics', 'Serve', 'Women coaching', 'Backhand']

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
    <div class="flex items-center justify-between gap-3">
      <h1 class="font-display text-xl font-black">{{ t('coaches.title') }}</h1>
      <button type="button" class="rounded-full border px-3 py-1 text-xs font-bold" @click="showFilters = !showFilters">{{ t('clubs.moreFilters') }}</button>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="rounded-full border px-3 py-1 text-xs" :class="filters.city === '' ? 'border-brand-primary text-brand-primary' : ''" @click="filters.city = ''; syncRoute()">{{ t('clubs.allCities') }}</button>
      <button v-for="city in cityOptions" :key="city" type="button" class="rounded-full border px-3 py-1 text-xs" :class="filters.city === city ? 'border-brand-primary text-brand-primary' : ''" @click="filters.city = city; syncRoute()">
        {{ city }}
      </button>
    </div>
    <div v-if="showFilters" class="ios-card grid gap-3 p-4 lg:grid-cols-3">
      <select v-model="filters.specialty" class="rounded-xl border px-3 py-2 text-sm" @change="syncRoute()">
        <option value="">{{ t('coaches.allSpecialties') }}</option>
        <option v-for="option in specialtyOptions" :key="option" :value="option">{{ option }}</option>
      </select>
      <select v-model="filters.sort" class="rounded-xl border px-3 py-2 text-sm" @change="syncRoute()">
        <option value="rank">{{ t('clubs.sort.rank') }}</option>
        <option value="rating">{{ t('clubs.sort.rating') }}</option>
        <option value="price">{{ t('clubs.sort.price') }}</option>
      </select>
      <label class="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
        <input v-model="filters.verified" type="checkbox" @change="syncRoute()" />
        {{ t('clubs.verifiedOnly') }}
      </label>
    </div>
    <div class="grid gap-4 lg:grid-cols-2">
      <NuxtLink
        v-for="c in coaches"
        :key="c.id"
        :to="localePath(`/coaches/${c.id}`)"
        class="ios-card flex items-center gap-3 p-3"
      >
        <img :src="c.photo || '/demo/coaches/coach-1.jpg'" alt="" class="h-14 w-14 rounded-full object-cover" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <p class="font-bold">{{ localizedField(c, 'nameFa', 'nameEn') }}</p>
            <span v-if="c.verified" class="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary">{{ t('clubs.verified') }}</span>
          </div>
          <p class="text-xs text-brand-gray-600">{{ c.city }} · ⭐ {{ c.rating }} · {{ c.reviewCount }} {{ t('clubs.reviews') }}</p>
          <p v-if="c.specialties?.length" class="truncate text-xs text-brand-gray-600">{{ c.specialties.slice(0, 2).join(' · ') }}</p>
          <p class="text-sm font-black text-brand-primary">{{ formatCurrency(c.sessionPrice) }}</p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
