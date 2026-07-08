<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' })

const { data } = await useAuthedFetch('/api/bookings/mine')
const next = computed(() => data.value?.courtBookings?.[0] || data.value?.coachSessions?.[0])

if (import.meta.server) {
  // #region agent log
  fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'pre-fix-athlete',hypothesisId:'F',location:'app/pages/athlete/index.vue',message:'athlete dashboard render input',data:{hasData:Boolean(data.value),courtBookingCount:data.value?.courtBookings?.length ?? null,coachSessionCount:data.value?.coachSessions?.length ?? null,nextHasSlot:Boolean((next.value as any)?.slot),nextStartTime:(next.value as any)?.slot?.startTime ?? (next.value as any)?.startTime ?? null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}
</script>

<template>
  <div class="space-y-4">
    <div class="ios-card p-4">
      <h2 class="font-bold">{{ $t('nav.overview') }}</h2>
      <p v-if="next" class="mt-2 text-sm">{{ next.slot ? next.slot.startTime : next.startTime }}</p>
      <p v-else class="mt-2 text-sm text-brand-gray-600">{{ $t('athlete.nextBookingFallback') }}</p>
    </div>
    <NuxtLink to="/athlete/bookings" class="btn-primary block text-center">{{ $t('nav.bookings') }}</NuxtLink>
  </div>
</template>
