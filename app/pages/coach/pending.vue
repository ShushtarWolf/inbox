<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { fetch, coachStatus } = usePlatformRoles()

const isRejected = computed(() => coachStatus.value === 'REJECTED')

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
    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <div
        class="canva-panel space-y-2 p-5 text-start"
        :class="isRejected
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-amber-200 bg-amber-50 text-amber-950'"
        role="status"
      >
        <p class="text-sm font-bold">{{ t('coach.pendingTitle') }}</p>
        <p class="text-sm" :class="isRejected ? 'text-red-800/90' : 'text-amber-900/90'">
          {{ isRejected ? t('coach.pendingRejected') : t('coach.pendingBody') }}
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <NuxtLink
          :to="localePath('/coach/profile')"
          class="canva-gate-btn-secondary text-center no-underline"
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
          class="canva-owner-secondary-cta text-center text-brand-primary no-underline"
        >
          {{ t('auth.chooseRole.backToPicker') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
