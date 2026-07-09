<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' })

const { t } = useI18n()
const { data: coaches } = await useAuthedFetch('/api/coaches')
const { data: packages, refresh } = await useAuthedFetch('/api/owner/packages')
useOwnerClubRefresh(refresh)
const { localizedField } = useLocalizedField()

const form = reactive({ title: '', capacity: 8, price: 0, discount: 0, coachId: '', comment: '' })

async function create() {
  await $fetch('/api/owner/packages', { method: 'POST', body: form })
  refresh()
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('owner.packages') }}</h1>
    <div class="flex flex-wrap gap-2">
      <div v-for="p in packages" :key="p.id" class="rounded-lg border bg-brand-cream px-4 py-6 text-sm">{{ p.title }}</div>
    </div>
    <div class="mx-auto max-w-lg space-y-2 rounded-2xl border border-black/5 bg-white p-4">
      <input v-model="form.title" :placeholder="t('owner.packagesPage.title')" class="w-full rounded-xl border px-3 py-2" />
      <select v-model="form.coachId" class="w-full rounded-xl border px-3 py-2">
        <option value="">{{ t('owner.packagesPage.coachPlaceholder') }}</option>
        <option v-for="c in coaches" :key="c.id" :value="c.id">{{ localizedField(c, 'nameFa', 'nameEn') }}</option>
      </select>
      <input v-model.number="form.price" type="number" :placeholder="t('owner.packagesPage.price')" class="w-full rounded-xl border px-3 py-2" />
      <input v-model.number="form.discount" type="number" :placeholder="t('owner.packagesPage.discount')" class="w-full rounded-xl border px-3 py-2" />
      <button type="button" class="btn-primary w-full" @click="create">{{ t('owner.packagesPage.saveStub') }}</button>
    </div>
  </div>
</template>
