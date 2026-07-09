<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' })

const { t } = useI18n()
const { data, refresh } = await useAuthedFetch('/api/owner/equipments')
useOwnerClubRefresh(refresh)
const { localizedField } = useLocalizedField()
const grouped = computed(() => ({
  CLUB: data.value?.filter((e: { category: string }) => e.category === 'CLUB') || [],
  RENTAL: data.value?.filter((e: { category: string }) => e.category === 'RENTAL') || [],
  SELL: data.value?.filter((e: { category: string }) => e.category === 'SELL') || [],
  SERVICE: data.value?.filter((e: { category: string }) => e.category === 'SERVICE') || [],
}))

async function add() {
  await $fetch('/api/owner/equipments', { method: 'POST', body: { nameFa: 'جدید', category: 'CLUB' } })
  refresh()
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('owner.equipments') }}</h1>
    <div class="grid gap-4 md:grid-cols-3">
      <div
        v-for="(label, cat) in { CLUB: t('owner.equipmentsPage.club'), RENTAL: t('owner.equipmentsPage.rental'), SELL: t('owner.equipmentsPage.sell') }"
        :key="cat"
        class="rounded-xl border bg-white p-4"
      >
        <h3 class="mb-2 font-bold">{{ label }}</h3>
        <ul class="space-y-1 text-sm">
          <li v-for="e in grouped[cat as keyof typeof grouped]" :key="e.id">{{ localizedField(e, 'nameFa', 'nameEn') }}</li>
        </ul>
        <button v-if="cat === 'CLUB'" type="button" class="mt-2 text-xs font-bold text-brand-primary" @click="add">{{ t('common.add') }}</button>
      </div>
    </div>
    <div class="mx-auto w-full max-w-xs rounded-xl border bg-white p-4 md:mx-0">
      <h3 class="font-bold">{{ t('owner.equipmentsPage.services') }}</h3>
      <ul class="mt-2 text-sm"><li v-for="e in grouped.SERVICE" :key="e.id">{{ localizedField(e, 'nameFa', 'nameEn') }}</li></ul>
    </div>
  </div>
</template>
