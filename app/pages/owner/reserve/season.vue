<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' })

const localePath = useLocalePath()
const form = reactive({ guestName: '', guestFamily: '', guestMobile: '', days: ['Sun'], times: ['12:00'], comments: '' })

async function submit() {
  await $fetch('/api/owner/season', { method: 'POST', body: { ...form } })
  await navigateTo(localePath('/owner'))
}
</script>

<template>
  <div class="max-w-md space-y-3 rounded-xl bg-white p-4 shadow-card">
    <h1 class="font-bold">{{ $t('owner.seasonPage.title') }}</h1>
    <input v-model="form.guestName" :placeholder="$t('owner.guestName')" class="w-full rounded border px-2 py-1.5" />
    <input v-model="form.guestFamily" :placeholder="$t('owner.guestFamily')" class="w-full rounded border px-2 py-1.5" />
    <input v-model="form.guestMobile" :placeholder="$t('owner.guestMobile')" class="w-full rounded border px-2 py-1.5" />
    <textarea v-model="form.comments" class="w-full rounded border px-2 py-1.5" />
    <button type="button" class="btn-primary w-full" @click="submit">{{ $t('common.save') }}</button>
  </div>
</template>
