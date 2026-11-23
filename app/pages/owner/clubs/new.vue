<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
</script>

<template>
  <div class="venus-page-stack canva-cal-sheet -mx-4 min-[431px]:mx-0">
    <header class="text-start">
      <h1 class="text-base font-bold text-brand-navy">{{ t('owner.addClub.title') }}</h1>
    </header>
    <OwnerAddClubForm />
  </div>
</template>