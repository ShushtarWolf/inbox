<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatDistanceKm } = useFormatters()
const showMoreFilters = ref(false)
const showMap = ref(false)
const locating = ref(false)
const selectedMapClubSlug = ref<string | null>(null)

const filters = reactive({
  city: (route.query.city as string) || '',
  amenity: (route.query.amenity as string) || '',
  sort: (route.query.sort as string) || 'rank',
  verified: route.query.verified === 'true',
  minPrice: (route.query.minPrice as string) || '',
})

const query = computed(() => ({
  sport: route.query.sport as string | undefined,
  city: filters.city || undefined,
  amenity: filters.amenity || undefined,
  sort: filters.sort,
  verified: filters.verified ? 'true' : undefined,
  minPrice: filters.minPrice || undefined,
  lat: route.query.lat as string | undefined,
  lng: route.query.lng as string | undefined,
  radiusKm: route.query.radiusKm as string | undefined,
}))

const { data: clubs, pending, error } = await useFetch('/api/clubs', {
  query,
})

const cityOptions = [
  { value: 'تهران', key: 'tehran' },
  { value: 'اصفهان', key: 'isfahan' },
  { value: 'شیراز', key: 'shiraz' },
] as const
const amenityOptions = ['Parking', 'Cafe', 'Locker room', 'Shower', 'Pro shop', 'Kids area'] as const

function cityLabel(key: 'tehran' | 'isfahan' | 'shiraz') {
  return t(`clubs.cityOptions.${key}`)
}

function amenityLabel(value: string) {
  return t(`clubs.amenityOptions.${value}` as 'clubs.amenityOptions.Parking')
}

const clubsWithCoordinates = computed(() => {
  return (clubs.value || []).filter((club) => typeof club.lat === 'number' && typeof club.lng === 'number')
})

watch(clubsWithCoordinates, (mapClubs) => {
  if (!mapClubs.length) {
    selectedMapClubSlug.value = null
    return
  }

  if (!selectedMapClubSlug.value || !mapClubs.some((club) => club.slug === selectedMapClubSlug.value)) {
    selectedMapClubSlug.value = mapClubs[0]?.slug || null
  }
}, { immediate: true })

const selectedMapClub = computed(() => {
  return clubsWithCoordinates.value.find((club) => club.slug === selectedMapClubSlug.value) || clubsWithCoordinates.value[0] || null
})

const selectedMapEmbedUrl = computed(() => {
  if (!selectedMapClub.value) return null

  const lat = selectedMapClub.value.lat as number
  const lng = selectedMapClub.value.lng as number
  const latDelta = 0.018
  const lngDelta = 0.026
  const bbox = [
    (lng - lngDelta).toFixed(6),
    (lat - latDelta).toFixed(6),
    (lng + lngDelta).toFixed(6),
    (lat + latDelta).toFixed(6),
  ].join('%2C')

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`
})

async function syncRoute(extra: Record<string, string | undefined> = {}) {
  await router.replace({
    query: {
      ...route.query,
      city: filters.city || undefined,
      amenity: filters.amenity || undefined,
      sort: filters.sort || undefined,
      verified: filters.verified ? 'true' : undefined,
      minPrice: filters.minPrice || undefined,
      ...extra,
    },
  })
}

async function useNearby() {
  if (!navigator.geolocation) return
  locating.value = true
  navigator.geolocation.getCurrentPosition(async (position) => {
    locating.value = false
    await syncRoute({
      lat: String(position.coords.latitude),
      lng: String(position.coords.longitude),
      radiusKm: '15',
    })
  }, () => {
    locating.value = false
  })
}
</script>

<template>
  <div class="space-y-4">
    <PageHeaderNav :title="t('clubs.title')" :home-to="localePath('/')" />

    <div class="flex flex-wrap gap-2">
      <button type="button" class="rounded-full border px-3 py-1 text-xs font-bold" @click="showMap = !showMap">{{ t('clubs.mapView') }}</button>
      <button type="button" class="rounded-full border px-3 py-1 text-xs font-bold" @click="showMoreFilters = !showMoreFilters">{{ t('clubs.moreFilters') }}</button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button type="button" class="rounded-full border px-3 py-1 text-xs" :class="filters.city === '' ? 'border-brand-primary text-brand-primary' : ''" @click="filters.city = ''; syncRoute()">{{ t('clubs.allCities') }}</button>
      <button v-for="city in cityOptions" :key="city.value" type="button" class="rounded-full border px-3 py-1 text-xs" :class="filters.city === city.value ? 'border-brand-primary text-brand-primary' : ''" @click="filters.city = city.value; syncRoute()">
        {{ cityLabel(city.key) }}
      </button>
      <button type="button" class="rounded-full border px-3 py-1 text-xs" @click="useNearby">{{ locating ? t('common.loading') : t('clubs.nearby') }}</button>
    </div>

    <div v-if="showMoreFilters" class="ios-card space-y-3 p-4">
      <div class="grid gap-3 lg:grid-cols-4">
        <select v-model="filters.amenity" class="rounded-xl border px-3 py-2 text-sm" @change="syncRoute()">
          <option value="">{{ t('clubs.allAmenities') }}</option>
          <option v-for="option in amenityOptions" :key="option" :value="option">{{ amenityLabel(option) }}</option>
        </select>
        <select v-model="filters.sort" class="rounded-xl border px-3 py-2 text-sm" @change="syncRoute()">
          <option value="rank">{{ t('clubs.sort.rank') }}</option>
          <option value="rating">{{ t('clubs.sort.rating') }}</option>
          <option value="price">{{ t('clubs.sort.price') }}</option>
          <option value="nearby">{{ t('clubs.sort.nearby') }}</option>
        </select>
        <input v-model="filters.minPrice" type="number" class="rounded-xl border px-3 py-2 text-sm" :placeholder="t('clubs.minPrice')" @change="syncRoute()" />
        <label class="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
          <input v-model="filters.verified" type="checkbox" @change="syncRoute()" />
          {{ t('clubs.verifiedOnly') }}
        </label>
      </div>
    </div>

    <div v-if="showMap" class="ios-card space-y-3 p-4">
      <p class="text-sm font-bold">{{ t('clubs.mapView') }}</p>
      <div class="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]">
        <div class="overflow-hidden rounded-[24px] border border-black/5 bg-brand-cream/40">
          <div class="relative min-h-[320px]">
            <iframe
              v-if="selectedMapEmbedUrl"
              :src="selectedMapEmbedUrl"
              class="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              :title="t('clubs.mapView')"
            />
            <div v-else class="flex h-[320px] items-center justify-center px-6 text-center text-sm text-brand-gray-600">
              {{ t('common.empty') }}
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <button
            v-for="club in clubsWithCoordinates"
            :key="`${club.id}-map`"
            type="button"
            class="w-full rounded-xl border p-3 text-start text-sm transition"
            :class="selectedMapClubSlug === club.slug ? 'border-brand-primary bg-brand-primary/5' : 'border-black/8 bg-white'"
            @click="selectedMapClubSlug = club.slug"
          >
            <p class="font-bold">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
            <p class="text-brand-gray-600">{{ club.city }}<span v-if="club.distanceKm != null"> · {{ formatDistanceKm(club.distanceKm) }}</span></p>
          </button>
        </div>
      </div>
    </div>

    <p v-if="pending" class="text-sm text-brand-gray-600">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>
    <p v-else-if="!clubs?.length" class="text-sm text-brand-gray-600">{{ t('common.empty') }}</p>

    <div v-else class="grid gap-4 lg:grid-cols-2">
      <NuxtLink
        v-for="club in clubs"
        :key="club.id"
        :to="localePath(`/clubs/${club.slug}`)"
        class="ios-card flex gap-3 overflow-hidden"
      >
        <img :src="club.image || '/demo/clubs/padel-zone-tehran.jpg'" alt="" class="h-24 w-24 object-cover lg:h-full lg:w-40" />
        <div class="flex flex-1 flex-col justify-center py-2 pe-3">
          <div class="flex items-center gap-2">
            <p class="font-bold">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
            <span v-if="club.verified" class="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary">{{ t('clubs.verified') }}</span>
          </div>
          <p class="text-xs text-brand-gray-600">{{ club.city }} · ⭐ {{ club.rating }} · {{ club.reviewCount }} {{ t('clubs.reviews') }}</p>
          <p class="mt-1 text-sm font-black text-brand-primary">
            {{ formatCurrency(club.priceFrom) }}<span v-if="club.priceTo"> - {{ formatCurrency(club.priceTo) }}</span>
          </p>
          <p class="mt-1 text-xs text-brand-gray-600">{{ club.amenityPreview.map(amenityLabel).join(' · ') }}</p>
          <p v-if="club.distanceKm != null" class="mt-1 text-xs text-brand-gray-600">{{ t('clubs.distance') }}: {{ formatDistanceKm(club.distanceKm) }}</p>
        </div>
        <span class="self-center rounded-full bg-brand-primary/10 px-2.5 py-1 text-[11px] font-bold text-brand-primary">{{ t('home.clubCta') }}</span>
      </NuxtLink>
    </div>
  </div>
</template>
