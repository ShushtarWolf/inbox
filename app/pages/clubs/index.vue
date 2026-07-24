<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const { openGate } = useAuthFlow()
const { user } = useAuth()

const sportFilter = ref<string>((route.query.sport as string) || '')
const sort = ref((route.query.sort as string) || 'rank')

const query = computed(() => ({
  sport: sportFilter.value || undefined,
  sort: sort.value,
  city: route.query.city as string | undefined,
}))

const { data: clubs, pending, error } = await useFetch('/api/clubs', { query })
const { data: sports } = await useFetch('/api/sports')

const sportChips = computed(() => [
  { value: '', label: t('clubs.sportAll') },
  { value: 'tennis', label: t('home.tennisTitle') },
  { value: 'padel', label: t('home.padelTitle') },
])

const listTitle = computed(() => {
  if (sportFilter.value === 'tennis') return t('clubs.tennisCourtsTitle')
  if (sportFilter.value === 'padel') return t('clubs.padelCourtsTitle')
  return t('clubs.courtsTitle')
})

async function setSport(value: string) {
  sportFilter.value = value
  await router.replace({
    query: {
      ...route.query,
      sport: value || undefined,
      sort: sort.value || undefined,
    },
  })
}

async function setSort(value: string) {
  sort.value = value
  await router.replace({
    query: {
      ...route.query,
      sport: sportFilter.value || undefined,
      sort: value || undefined,
    },
  })
}

function clubMeta(club: { city?: string; rating?: number; sports?: string[] }) {
  const sportSlug = club.sports?.[0]
  const sportName = sports.value?.find((item) => item.slug === sportSlug)
  const label = sportName ? localizedField(sportName, 'nameFa', 'nameEn') : t('home.sportsLabel')
  return `${club.city || 'تهران'} | ${label} | ${(club.rating ?? 4.5).toFixed(1)}`
}

function priceLine(club: { priceFrom?: number | null; priceTo?: number | null }) {
  if (club.priceFrom == null && club.priceTo == null) return ''
  if (club.priceFrom != null && club.priceTo != null && club.priceFrom !== club.priceTo) {
    return t('clubs.sessionPriceRange', {
      from: formatCurrency(club.priceFrom),
      to: formatCurrency(club.priceTo),
    })
  }
  return t('clubs.sessionPriceFrom', { price: formatCurrency(club.priceFrom ?? club.priceTo ?? 0) })
}
</script>

<template>
  <div class="tail-page-stack animate-fade-in">
    <header class="flex items-center justify-between gap-3">
      <button
        v-if="!user"
        type="button"
        class="btn-primary px-3 py-1.5 text-xs"
        @click="openGate()"
      >
        {{ t('auth.loginRegister') }}
      </button>
      <NuxtLink v-else :to="localePath('/athlete')" class="rounded-lg bg-brand-primary-soft px-3 py-1.5 text-xs font-bold text-brand-primary">
        {{ t('nav.me') }}
      </NuxtLink>
      <div class="flex items-center gap-2">
        <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7" />
        <span class="font-display text-lg font-bold tracking-wide text-brand-primary">INBOX</span>
      </div>
    </header>

    <section class="canva-hero">
      <img src="/hero/tennis-court.jpg" alt="" class="canva-hero-media" />
      <div class="canva-hero-content">
        <h1 class="max-w-xs text-3xl font-bold leading-none">{{ t('home.heroSlideTitle') }}</h1>
        <p class="max-w-sm text-sm text-white/90">{{ t('home.heroBody') }}</p>
      </div>
    </section>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="chip in sportChips"
          :key="chip.value || 'all'"
          type="button"
          class="canva-sport-chip"
          :class="sportFilter === chip.value ? 'canva-sport-chip-active' : 'canva-sport-chip-idle'"
          @click="setSport(chip.value)"
        >
          {{ chip.label }}
        </button>
      </div>
      <select
        :value="sort"
        class="rounded-full border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy"
        @change="setSort(($event.target as HTMLSelectElement).value)"
      >
        <option value="rank">{{ t('clubs.sort.rank') }}</option>
        <option value="rating">{{ t('clubs.sort.rating') }}</option>
        <option value="price">{{ t('clubs.sort.price') }}</option>
      </select>
    </div>

    <section class="space-y-3">
      <div>
        <h2 class="text-lg font-bold text-brand-primary">{{ listTitle }}</h2>
        <p class="text-xs text-brand-gray-600">{{ t('home.suggestionsBody') }}</p>
      </div>

      <AppAsyncState :pending="pending" :error="error" :empty="!clubs?.length" skeleton-variant="table">
        <div class="space-y-3">
          <NuxtLink
            v-for="club in clubs"
            :key="club.id"
            :to="localePath(`/book/court/${club.slug}`)"
            class="canva-court-card"
          >
            <img :src="club.image || '/placeholders/club.svg'" alt="" />
            <div class="canva-court-card-body">
              <span class="btn-primary shrink-0 px-3 py-1.5 text-xs">{{ t('home.bookNow') }}</span>
              <div class="min-w-0 flex-1 text-end">
                <p class="truncate text-base font-bold">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
                <p class="mt-0.5 text-[11px] text-white/85">{{ clubMeta(club) }}</p>
                <p v-if="priceLine(club)" class="mt-1 text-xs font-bold text-[#ffb4b4]">{{ priceLine(club) }}</p>
              </div>
            </div>
          </NuxtLink>
        </div>
      </AppAsyncState>
    </section>
  </div>
</template>
