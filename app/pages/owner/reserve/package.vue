<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' })

const localePath = useLocalePath()
const { data: coaches } = await useAuthedFetch('/api/coaches')
const { localizedField } = useLocalizedField()
const form = reactive({ guestName: '', guestFamily: '', guestMobile: '', coachId: '', days: ['Sun'], times: ['12:00'], comments: '' })

async function submit() {
  await $fetch('/api/owner/package-reserve', { method: 'POST', body: { ...form } })
  await navigateTo(localePath('/owner'))
}
</script>

<template>
  <div class="max-w-md space-y-3 rounded-xl bg-white p-4 shadow-card">
    <h1 class="font-bold">{{ $t('owner.packagePage.title') }}</h1>
    <select v-model="form.coachId" class="w-full rounded border px-2 py-1.5">
      <option value="">{{ $t('owner.packagePage.coachPlaceholder') }}</option>
      <option v-for="c in coaches" :key="c.id" :value="c.id">{{ localizedField(c, 'nameFa', 'nameEn') }}</option>
    </select>
    <input v-model="form.guestName" :placeholder="$t('owner.guestName')" class="w-full rounded border px-2 py-1.5" />
    <input v-model="form.guestFamily" :placeholder="$t('owner.guestFamily')" class="w-full rounded border px-2 py-1.5" />
    <input v-model="form.guestMobile" :placeholder="$t('owner.guestMobile')" class="w-full rounded border px-2 py-1.5" />
    <button type="button" class="btn-primary w-full" @click="submit">{{ $t('common.save') }}</button>
  </div>
</template>
