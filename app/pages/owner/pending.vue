<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { user, fetch: fetchAuth } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })

const activeMembership = computed(() => {
  const memberships = user.value?.memberships || []
  return memberships.find((m) => m.club.id === selectedClubId.value) || memberships[0]
})

const clubStatus = computed(() => activeMembership.value?.club?.status || null)
const clubName = computed(() => activeMembership.value?.club?.nameFa || '')

watch(clubStatus, (status) => {
  if (status === 'ACTIVE') {
    navigateTo(localePath('/owner/calendar'), { replace: true })
  }
}, { immediate: true })

onMounted(() => {
  fetchAuth()
})
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 px-4 py-8 text-start">
    <div
      class="border border-amber-200 bg-amber-50 p-5"
      style="border-radius: 2px;"
    >
      <p class="text-sm font-bold text-amber-950">{{ t('owner.pendingTitle') }}</p>
      <p class="mt-2 text-sm text-amber-900/90">
        {{ t('owner.pendingBody', { name: clubName || t('owner.pendingClubFallback') }) }}
      </p>
      <p
        v-if="clubStatus === 'SUSPENDED'"
        class="mt-3 text-sm font-bold text-red-700"
      >
        {{ t('owner.pendingRejected') }}
      </p>
    </div>

    <div class="flex flex-col gap-2">
      <NuxtLink
        :to="localePath('/owner/setup')"
        class="border border-brand-gray-300 bg-white px-4 py-3 text-center text-sm font-bold text-brand-navy transition hover:border-brand-primary/40"
        style="border-radius: 2px;"
      >
        {{ t('owner.pendingSetupCta') }}
      </NuxtLink>
      <NuxtLink
        :to="localePath('/owner/settings')"
        class="border border-brand-gray-300 bg-white px-4 py-3 text-center text-sm font-bold text-brand-navy transition hover:border-brand-primary/40"
        style="border-radius: 2px;"
      >
        {{ t('owner.pendingSettingsCta') }}
      </NuxtLink>
      <button
        type="button"
        class="bg-brand-primary px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
        style="border-radius: 2px;"
        @click="fetchAuth()"
      >
        {{ t('owner.pendingRefresh') }}
      </button>
      <NuxtLink
        :to="localePath('/choose-role')"
        class="px-4 py-3 text-center text-sm font-bold text-brand-primary"
      >
        {{ t('auth.chooseRole.backToPicker') }}
      </NuxtLink>
    </div>
  </div>
</template>
