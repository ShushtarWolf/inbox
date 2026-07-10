<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatHours } = useFormatters()
const { data, refresh } = await useAuthedFetch('/api/owner/settings')
useOwnerClubRefresh(refresh)
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-4">
    <PageHeaderNav :title="t('owner.settings')" :home-to="localePath('/')" :back-to="localePath('/owner')" />
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-2xl border border-black/5 bg-white p-6">
        <h2 class="font-bold">{{ t('owner.settingsPage.clubProfile') }}</h2>
        <div v-if="data?.club" class="mt-3 space-y-2 text-sm">
          <p><span class="font-bold">{{ t('owner.activeClub') }}:</span> {{ localizedField(data.club, 'nameFa', 'nameEn') }}</p>
          <p><span class="font-bold">{{ t('owner.settingsPage.role') }}:</span> {{ t(`owner.roles.${data.membership?.role}` as 'owner.roles.CLUB_ADMIN') }}</p>
          <p><span class="font-bold">{{ t('owner.settingsPage.slug') }}:</span> <bdi dir="ltr">{{ data.club.slug }}</bdi></p>
          <p><span class="font-bold">{{ t('owner.settingsPage.location') }}:</span> {{ data.club.city }}<span v-if="data.club.district"> · {{ data.club.district }}</span></p>
          <p><span class="font-bold">{{ t('owner.settingsPage.address') }}:</span> {{ localizedField(data.club, 'addressFa', 'addressEn') }}</p>
        </div>
      </div>

      <div class="rounded-2xl border border-black/5 bg-white p-6">
        <h2 class="font-bold">{{ t('owner.settingsPage.operations') }}</h2>
        <div v-if="data?.club" class="mt-3 space-y-2 text-sm">
          <p><span class="font-bold">{{ t('owner.settingsPage.hours') }}:</span> <bdi dir="ltr" class="tabular-nums">{{ data.club.openHour }}:00 - {{ data.club.closeHour }}:00</bdi></p>
          <p><span class="font-bold">{{ t('owner.settingsPage.cancellation') }}:</span> {{ formatHours(data.club.cancellationWindowHours) }}</p>
          <p><span class="font-bold">{{ t('owner.settingsPage.reschedule') }}:</span> {{ formatHours(data.club.rescheduleWindowHours) }}</p>
          <p><span class="font-bold">{{ t('owner.settingsPage.waitlist') }}:</span> {{ data.club.waitlistEnabled ? t('owner.settingsPage.waitlistEnabled') : t('owner.settingsPage.waitlistDisabled') }}</p>
          <p><span class="font-bold">{{ t('owner.settingsPage.inventory') }}:</span> {{ data.counts?.courts || 0 }} {{ t('owner.settingsPage.courts') }} · {{ data.counts?.coaches || 0 }} {{ t('owner.settingsPage.coaches') }}</p>
        </div>
      </div>

      <div class="rounded-2xl border border-black/5 bg-white p-6 md:col-span-2">
        <h2 class="font-bold">{{ t('owner.settingsPage.contacts') }}</h2>
        <div v-if="data?.club" class="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <p><span class="font-bold">{{ t('common.mobile') }}:</span> <bdi dir="ltr" class="tabular-nums">{{ data.club.phone || t('common.empty') }}</bdi></p>
          <p><span class="font-bold">{{ t('common.whatsapp') }}:</span> <bdi dir="ltr" class="tabular-nums">{{ data.club.whatsapp || t('common.empty') }}</bdi></p>
        </div>
      </div>
    </div>
  </div>
</template>
