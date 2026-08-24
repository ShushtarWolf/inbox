<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatIsoDate } = useFormatters()
const { competitionsEnabled } = usePilotFlags()

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
  <div class="mx-auto max-w-lg px-4 py-6">
    <h1 class="mb-4 text-xl font-bold text-gray-900">
      {{ t('competitions.title') }}
    </h1>

    <CanvaEmptyState
      v-if="!competitionsEnabled"
      :title="t('competitions.comingSoon')"
      icon="emoji_events"
    />

    <template v-else>
    <div class="mb-4 flex flex-wrap gap-2">
      <select
        v-model="sportFilter"
        class="rounded-sm border border-gray-300 px-2 py-1 text-sm"
        @change="applyFilters"
      >
        <option value="">
          {{ t('common.all') }}
        </option>
        <option v-for="sport in sports || []" :key="sport.slug" :value="sport.slug">
          {{ localizedField(sport, 'name') }}
        </option>
      </select>
      <input
        v-model="cityFilter"
        type="text"
        class="rounded-sm border border-gray-300 px-2 py-1 text-sm"
        :placeholder="t('competitions.filterCity')"
        @change="applyFilters"
      >
    </div>

    <p v-if="pending" class="text-sm text-gray-500">
      {{ t('common.loading') }}
    </p>
    <p v-else-if="error" class="text-sm text-red-600">
      {{ t('common.error') }}
    </p>
    <p v-else-if="!competitions?.length" class="text-sm text-gray-500">
      {{ t('common.empty') }}
    </p>

    <ul v-else class="space-y-3">
      <li
        v-for="item in competitions"
        :key="item.id"
        class="border border-gray-200 p-3"
      >
        <NuxtLink :to="localePath(`/competitions/${item.id}`)" class="block">
          <h2 class="font-semibold text-gray-900">
            {{ item.title }}
          </h2>
          <p class="mt-1 text-sm text-gray-600">
            {{ localizedField(item.club, 'name') }}
            <span v-if="item.club.city"> · {{ item.club.city }}</span>
          </p>
          <p class="mt-1 text-sm text-gray-600">
            {{ formatIsoDate(item.eventAt) }}
            · {{ localizedField(item.sport, 'name') }}
          </p>
          <p class="mt-2 text-sm">
            <span v-if="item.entryFee > 0">{{ t('competitions.fee', { amount: formatCurrency(item.entryFee) }) }}</span>
            <span v-else>{{ t('competitions.freeEntry') }}</span>
          </p>
          <p class="mt-1 text-sm font-medium" :class="item.isFull ? 'text-red-600' : 'text-green-700'">
            {{ item.isFull ? t('competitions.full') : t('competitions.spotsLeft', { count: item.spotsLeft }) }}
          </p>
        </NuxtLink>
      </li>
    </ul>
    </template>
  </div>
</template>
