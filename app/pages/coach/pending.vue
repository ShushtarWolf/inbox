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
  <div class="venus-page-stack">
    <CanvaCoachPhotoHero />
    <div class="mx-auto w-full space-y-4 text-start">
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
        class="canva-owner-secondary-cta text-center"
      >
        {{ t('coach.pendingProfileCta') }}
      </NuxtLink>
      <button
        type="button"
        class="canva-gate-btn-primary"
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
  </div>
</template>
