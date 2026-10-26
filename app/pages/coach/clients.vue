<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' , ssr: false})

const { t } = useI18n()
const localePath = useLocalePath()
const { formatPhone, formatIsoDate, formatTimeLabel, formatFaDigits } = useFormatters()
const query = ref('')
const { data, pending, error } = await useAuthedFetch<{
  clients?: Array<{
    id: string
    name: string
    phone: string
    nextSessionDate: string
    nextSessionTime: string
  }>
}>('/api/coach/clients')

const clients = computed(() => {
  const rows = data.value?.clients || []
  const q = query.value.trim()
  if (!q) return rows
  const needle = formatFaDigits(q).replace(/\s+/g, '')
  return rows.filter((row) => {
    const name = formatFaDigits(row.name)
    const phone = formatFaDigits(row.phone).replace(/\s+/g, '')
    return name.includes(needle) || phone.includes(needle) || row.phone.includes(q) || row.name.includes(q)
  })
})
</script>

<template>
  <div class="venus-page-stack">
    <CanvaCoachPhotoHero />
    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0 text-start">
          <h1 class="mb-0 text-start text-base font-bold text-brand-navy min-[431px]:text-xl min-[431px]:leading-snug">
            {{ t('coach.clients') }}
          </h1>
          <p class="mt-1 text-xs text-brand-gray-600">{{ t('coach.clientsLead') }}</p>
        </div>
        <NuxtLink :to="localePath('/coach/book')" class="canva-gate-btn-primary shrink-0 px-4 py-2 text-xs">
          {{ t('coach.bookForStudent') }}
        </NuxtLink>
      </div>
      <AppFormField field-id="coach-clients-search" :label="t('coach.clientsSearch')" class="mb-3 max-w-xs">
        <input
          id="coach-clients-search"
          v-model="query"
          type="search"
          class="neo-input w-full"
          :placeholder="t('coach.clientsSearch')"
        >
      </AppFormField>
      <AppAsyncState :pending="pending" :error="error" :empty="!data?.clients?.length" skeleton-variant="table">
        <p v-if="data?.clients?.length && !clients.length" class="canva-panel text-sm text-brand-gray-600">
          {{ t('coach.clientsEmptySearch') }}
        </p>
        <div v-else class="flex flex-col gap-2">
          <article
            v-for="c in clients"
            :key="c.id"
            class="canva-finance-tx-card"
          >
            <div class="min-w-0 flex-1 text-start">
              <p class="text-sm font-bold text-brand-navy">{{ c.name }}</p>
              <p class="mt-0.5 text-xs font-medium text-brand-gray-600">
                <bdi dir="ltr" class="tabular-nums">{{ formatPhone(c.phone) }}</bdi>
              </p>
              <p class="mt-0.5 text-[11px] text-brand-gray-500">
                {{ t('coach.nextSession') }}:
                <bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(c.nextSessionDate) }} · {{ formatTimeLabel(c.nextSessionTime) }}</bdi>
              </p>
            </div>
          </article>
        </div>
      </AppAsyncState>
    </div>
  </div>
</template>
