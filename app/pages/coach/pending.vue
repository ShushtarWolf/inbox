<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { fetch, coachStatus } = usePlatformRoles()

watch(coachStatus, (status) => {
  if (status === 'APPROVED') {
    navigateTo(localePath('/coach'), { replace: true })
  }
}, { immediate: true })

onMounted(() => {
  fetch()
})
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 px-4 py-8 text-start">
    <div
      class="border border-amber-200 bg-amber-50 p-5"
      style="border-radius: 2px;"
    >
      <p class="text-sm font-bold text-amber-950">{{ t('coach.pendingTitle') }}</p>
      <p class="mt-2 text-sm text-amber-900/90">
        {{ coachStatus === 'REJECTED' ? t('coach.pendingRejected') : t('coach.pendingBody') }}
      </p>
    </div>

    <div class="flex flex-col gap-2">
      <NuxtLink
        :to="localePath('/coach/profile')"
        class="border border-brand-gray-300 bg-white px-4 py-3 text-center text-sm font-bold text-brand-navy transition hover:border-brand-primary/40"
        style="border-radius: 2px;"
      >
        {{ t('coach.pendingProfileCta') }}
      </NuxtLink>
      <button
        type="button"
        class="bg-brand-primary px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
        style="border-radius: 2px;"
        @click="fetch()"
      >
        {{ t('coach.pendingRefresh') }}
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
