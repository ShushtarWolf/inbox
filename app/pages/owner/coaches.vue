<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})
const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/staff')
useOwnerClubRefresh(refresh)
const { formatTimeRange } = useFormatters()
const { localizedField } = useLocalizedField()

function staffRoleLabel(role: string) {
  const key = `owner.roles.${role}` as const
  const translated = t(key)
  return translated === key ? role : translated
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="mb-4 font-display text-xl font-black">{{ $t('owner.coaches') }}</h1>
    <p v-if="pending" class="text-sm text-brand-gray-600">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>
    <div v-else class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-xl border bg-white p-4">
        <h2 class="mb-3 font-bold">{{ $t('owner.coaches') }}</h2>
        <ul class="space-y-2">
          <li v-for="member in data?.staff" :key="member.id" class="rounded-xl border p-3">
            <p class="font-bold">{{ member.coach ? localizedField(member.coach, 'nameFa', 'nameEn') : member.user.name }}</p>
            <p class="text-xs text-brand-gray-600">{{ staffRoleLabel(member.role) }} · <bdi dir="ltr" class="tabular-nums">{{ member.user.phone || member.user.email }}</bdi></p>
          </li>
        </ul>
      </section>
      <section class="rounded-xl border bg-white p-4">
        <h2 class="mb-3 font-bold">{{ $t('coach.schedule') }}</h2>
        <ul class="space-y-2 text-sm">
          <li v-for="session in data?.upcomingSessions" :key="session.id" class="rounded-xl border p-3">
            <p class="font-bold">{{ localizedField(session.coach, 'nameFa', 'nameEn') }}</p>
            <p class="text-brand-gray-600"><bdi dir="ltr" class="tabular-nums">{{ session.date }} · {{ formatTimeRange(session.startTime) }}</bdi></p>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
