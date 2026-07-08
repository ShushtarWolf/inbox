<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' })
const { data } = await useAuthedFetch('/api/owner/staff')
const { localizedField } = useLocalizedField()
</script>

<template>
  <div class="space-y-4">
    <h1 class="mb-4 font-display text-xl font-black">{{ $t('owner.coaches') }}</h1>
    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-xl border bg-white p-4">
        <h2 class="mb-3 font-bold">{{ $t('owner.coaches') }}</h2>
        <ul class="space-y-2">
          <li v-for="member in data?.staff" :key="member.id" class="rounded-xl border p-3">
            <p class="font-bold">{{ member.coach ? localizedField(member.coach, 'nameFa', 'nameEn') : member.user.name }}</p>
            <p class="text-xs text-brand-gray-600">{{ member.role }} · {{ member.user.phone || member.user.email }}</p>
          </li>
        </ul>
      </section>
      <section class="rounded-xl border bg-white p-4">
        <h2 class="mb-3 font-bold">{{ $t('coach.schedule') }}</h2>
        <ul class="space-y-2 text-sm">
          <li v-for="session in data?.upcomingSessions" :key="session.id" class="rounded-xl border p-3">
            <p class="font-bold">{{ localizedField(session.coach, 'nameFa', 'nameEn') }}</p>
            <p class="text-brand-gray-600">{{ session.date }} · {{ session.startTime }}</p>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
