<script setup lang="ts">
const localePath = useLocalePath()
const { t } = useI18n()

type Row = {
  id: string
  status: string
  rejectReason: string | null
  clubName: string
  clubSlug: string
  programPercent: number
  proofUrl: string | null
}

const { data, pending, refresh } = useAuthedFetch<{ items: Row[] }>('/api/discount-applications/mine')

const items = computed(() => data.value?.items || [])

function statusKey(status: string) {
  if (status === 'APPROVED') return 'approved'
  if (status === 'REJECTED') return 'rejected'
  return 'pending'
}

function statusBadgeClass(status: string) {
  if (status === 'APPROVED') return 'bg-[#dcebe1] text-[#2e7d4f]'
  if (status === 'REJECTED') return 'bg-brand-primary-soft text-brand-primary'
  return 'bg-[#f3e9d3] text-[#b68a3b]'
}

defineExpose({ refresh })
</script>

<template>
  <section v-if="pending || items.length" class="canva-panel space-y-3 text-start">
    <div>
      <h2 class="text-sm font-bold text-brand-navy">{{ t('studentVerify.profileSection') }}</h2>
      <p class="mt-1 text-xs text-brand-gray-600">{{ t('studentVerify.profileSectionHint') }}</p>
    </div>

    <p v-if="pending" class="text-xs text-brand-gray-600">{{ t('common.loading') }}</p>

    <ul v-else class="space-y-3">
      <li
        v-for="row in items"
        :key="row.id"
        class="flex flex-wrap items-start gap-3 border border-[rgba(44,44,42,.08)] p-3"
      >
        <div
          v-if="row.proofUrl"
          class="h-14 w-20 shrink-0 overflow-hidden border border-[rgba(44,44,42,.12)] bg-brand-gray-100"
        >
          <img :src="row.proofUrl" alt="" class="h-full w-full object-cover">
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <p class="text-sm font-bold text-brand-navy">{{ row.clubName }}</p>
          <span
            class="inline-block px-2 py-0.5 text-xs font-bold"
            :class="statusBadgeClass(row.status)"
            role="status"
          >
            {{ t(`studentVerify.profileStatus.${statusKey(row.status)}`) }}
          </span>
          <p v-if="row.status === 'REJECTED' && row.rejectReason" class="text-xs text-brand-gray-600">
            {{ row.rejectReason }}
          </p>
        </div>
        <NuxtLink
          :to="localePath(`/athlete/student-verify/${row.clubSlug}`)"
          class="canva-gate-btn-secondary shrink-0 px-3 py-1.5 text-xs font-bold"
        >
          {{ t('studentVerify.profileManage') }}
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>