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
const clubHeroImage = computed(() => activeMembership.value?.club?.image || '/hero/padel-court.jpg')

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
  <div class="venus-page-stack">
    <section class="canva-photo-hero">
      <CanvaHeroImg
        :src="clubHeroImage"
        alt=""
        img-class="canva-photo-hero-media"
        img-style="object-position: 50% 40%;"
        fetchpriority="high"
      />
      <div class="canva-photo-hero-wash canva-photo-hero-wash--sot" />
      <CanvaOwnerHeroChrome />
      <div class="canva-photo-hero-body !min-h-[8rem] !pb-6">
        <h1 class="canva-page-hero-title text-xl">{{ t('owner.pendingTitle') }}</h1>
        <p class="mt-1 text-sm text-white/85">{{ clubName || t('owner.pendingClubFallback') }}</p>
      </div>
    </section>

    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <div
        class="canva-panel space-y-2 p-5 text-start"
        :class="clubStatus === 'SUSPENDED'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-amber-200 bg-amber-50 text-amber-950'"
        role="status"
      >
        <span
          class="inline-block px-2 py-1 text-[10px] font-extrabold"
          style="border-radius: 2px;"
          :class="clubStatus === 'SUSPENDED'
            ? 'bg-red-100 text-red-900'
            : 'bg-amber-100 text-amber-900'"
        >
          {{ clubStatus === 'SUSPENDED' ? t('owner.pendingRejected') : t('owner.pendingTitle') }}
        </span>
        <p class="text-sm font-bold">{{ t('owner.pendingTitle') }}</p>
        <p class="text-sm" :class="clubStatus === 'SUSPENDED' ? 'text-red-800/90' : 'text-amber-900/90'">
          {{ t('owner.pendingBody', { name: clubName || t('owner.pendingClubFallback') }) }}
        </p>
        <p
          v-if="clubStatus === 'SUSPENDED'"
          class="text-sm font-bold text-red-700"
        >
          {{ t('owner.pendingRejected') }}
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <NuxtLink
          :to="localePath('/owner/setup')"
          class="canva-gate-btn-secondary text-center no-underline"
        >
          {{ t('owner.pendingSetupCta') }}
        </NuxtLink>
        <NuxtLink
          :to="localePath('/owner/settings')"
          class="canva-gate-btn-secondary text-center no-underline"
        >
          {{ t('owner.pendingSettingsCta') }}
        </NuxtLink>
        <button
          type="button"
          class="canva-gate-btn-primary"
          @click="fetchAuth()"
        >
          {{ t('owner.pendingRefresh') }}
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
