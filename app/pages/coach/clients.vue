<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' , ssr: false})

const { formatPhone } = useFormatters()
const { data, pending, error } = await useAuthedFetch<{
  clients?: Array<{
    id: string
    name: string
    phone: string
    nextSessionDate: string
    nextSessionTime: string
  }>
}>('/api/coach/clients')
</script>

<template>
  <div class="venus-page-stack">
    <CanvaCoachPhotoHero />
    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <h1 class="mb-0 text-start text-base font-bold text-brand-navy min-[431px]:text-xl min-[431px]:leading-snug">
        {{ $t('coach.clients') }}
      </h1>
      <AppAsyncState :pending="pending" :error="error" :empty="!data?.clients?.length" skeleton-variant="table">
        <div class="flex flex-col gap-2">
          <article
            v-for="c in data?.clients"
            :key="c.id"
            class="canva-finance-tx-card"
          >
            <div class="min-w-0 flex-1 text-start">
              <p class="text-sm font-bold text-brand-navy">{{ c.name }}</p>
              <p class="mt-0.5 text-xs font-medium text-brand-gray-600">
                <bdi dir="ltr" class="tabular-nums">{{ formatPhone(c.phone) }}</bdi>
              </p>
              <p class="mt-0.5 text-[11px] text-brand-gray-500">
                {{ $t('coach.nextSession') }}:
                <bdi dir="ltr" class="tabular-nums">{{ c.nextSessionDate }} · {{ c.nextSessionTime }}</bdi>
              </p>
            </div>
          </article>
        </div>
      </AppAsyncState>
    </div>
  </div>
</template>
