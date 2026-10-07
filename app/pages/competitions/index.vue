<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatIsoDate } = useFormatters()
const { competitionsEnabled } = usePilotFlags()

useHead({
  title: () => t('competitions.title'),
})

const sportFilter = ref<string>((route.query.sport as string) || '')
const cityFilter = ref<string>((route.query.city as string) || '')

const query = computed(() => ({
  sport: sportFilter.value || undefined,
  city: cityFilter.value || undefined,
  status: 'OPEN',
}))

const { data: competitions, pending, error } = await useFetch<Array<{
  id: string
  title: string
  format: string
  enrollmentType: string
  entryFee: number
  eventAt: string
  spotsLeft: number
  isFull: boolean
  club: { slug: string; nameFa: string; nameEn?: string; city?: string }
  sport: { slug: string; nameFa: string; nameEn?: string }
}>>('/api/competitions', { query, immediate: competitionsEnabled.value })

const showPending = useHeldPending(pending, { forceRelease: () => Boolean(error.value) })

const { data: sports } = await useFetch<Array<{ slug: string; nameFa: string; nameEn?: string }>>('/api/sports')

async function applyFilters() {
  await router.replace({
    query: {
      sport: sportFilter.value || undefined,
      city: cityFilter.value || undefined,
    },
  })
}
</script>

<template>
  <div class="tail-page-stack animate-fade-in">
    <CanvaPublicChrome back-to="/" />

    <div class="canva-clubs-section-head">
      <div class="canva-clubs-section-copy">
        <h1 class="canva-clubs-section-title">{{ t('competitions.title') }}</h1>
      </div>
    </div>

    <CanvaEmptyState
      v-if="!competitionsEnabled"
      :title="t('competitions.comingSoon')"
      icon="emoji_events"
    />

    <template v-else>
      <div class="canva-panel grid gap-3 min-[431px]:grid-cols-2">
        <label class="flex min-w-0 flex-col gap-1 text-xs font-bold text-brand-gray-600">
          <span class="sr-only">{{ t('home.sportsTitle') }}</span>
          <select
            v-model="sportFilter"
            class="neo-select"
            @change="applyFilters"
          >
            <option value="">
              {{ t('common.all') }}
            </option>
            <option v-for="sport in sports || []" :key="sport.slug" :value="sport.slug">
              {{ localizedField(sport, 'name') }}
            </option>
          </select>
        </label>
        <label class="flex min-w-0 flex-col gap-1 text-xs font-bold text-brand-gray-600">
          <span class="sr-only">{{ t('competitions.filterCity') }}</span>
          <input
            v-model="cityFilter"
            type="text"
            class="neo-input"
            :placeholder="t('competitions.filterCity')"
            @change="applyFilters"
          >
        </label>
      </div>

      <AppVenusSpinner v-if="showPending" size="sm" :label="t('common.loading')" />
      <p v-else-if="error" class="text-sm text-brand-primary">
        {{ t('common.error') }}
      </p>
      <CanvaEmptyState
        v-else-if="!competitions?.length"
        :title="t('common.empty')"
        icon="emoji_events"
      />

      <ul v-else class="space-y-3">
        <li
          v-for="item in competitions"
          :key="item.id"
        >
          <NuxtLink
            :to="localePath(`/competitions/${item.id}`)"
            class="block border border-brand-gray-200 bg-white p-3 shadow-venus-sm transition hover:border-brand-primary"
            style="border-radius: var(--sz-canva-radius);"
          >
            <h2 class="text-start font-bold text-brand-navy">
              {{ item.title }}
            </h2>
            <p class="mt-1 text-start text-sm text-brand-gray-600">
              {{ localizedField(item.club, 'name') }}
              <span v-if="item.club.city"> · {{ item.club.city }}</span>
            </p>
            <p class="mt-1 text-start text-sm text-brand-gray-600">
              <bdi dir="ltr">{{ formatIsoDate(item.eventAt) }}</bdi>
              · {{ localizedField(item.sport, 'name') }}
            </p>
            <p class="mt-2 text-start text-sm tabular-nums text-brand-navy">
              <span v-if="item.entryFee > 0">{{ t('competitions.fee', { amount: formatCurrency(item.entryFee) }) }}</span>
              <span v-else>{{ t('competitions.freeEntry') }}</span>
            </p>
            <p
              class="mt-1 text-start text-sm font-bold"
              :class="item.isFull ? 'text-brand-primary' : 'text-emerald-700'"
            >
              {{ item.isFull ? t('competitions.full') : t('competitions.spotsLeft', { count: item.spotsLeft }) }}
            </p>
          </NuxtLink>
        </li>
      </ul>
    </template>
  </div>
</template>
