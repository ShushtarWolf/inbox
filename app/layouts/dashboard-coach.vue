<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { fetch: fetchAuth } = useAuth()
const { packagesEnabled } = usePilotFlags()
const { fetch: fetchRoles, coachStatus } = usePlatformRoles()

const pendingAllowed = computed(() => {
  const path = route.path.replace(/\/+$/, '') || '/'
  return path.endsWith('/coach/pending') || path.endsWith('/coach/profile')
})

onMounted(async () => {
  await fetchAuth()
  await fetchRoles()
})

watch([coachStatus, () => route.path], ([status]) => {
  if (!status) return
  if ((status === 'PENDING' || status === 'REJECTED') && !pendingAllowed.value) {
    navigateTo(localePath('/coach/pending'), { replace: true })
  }
})

const nav = computed(() => {
  const items = [
    { to: localePath('/coach'), label: t('coach.today'), icon: 'today' },
    { to: localePath('/coach/schedule'), label: t('coach.schedule'), icon: 'schedule' },
    { to: localePath('/coach/book'), label: t('coach.book.navLabel'), icon: 'add_circle' },
    { to: localePath('/coach/clients'), label: t('coach.clients'), icon: 'groups' },
  ]
  if (packagesEnabled.value) {
    items.push({ to: localePath('/coach/packages'), label: t('owner.packages'), icon: 'inventory_2' })
  }
  items.push({ to: localePath('/coach/profile'), label: t('nav.profile'), icon: 'person' })
  return items
})

/** Packages page is out of Slice 1 content scope; still needs chrome under hide-mobile-header. */
const showLayoutPhotoHero = computed(() => {
  const path = route.path.replace(/\/+$/, '') || '/'
  return path.endsWith('/coach/packages')
})
</script>

<template>
  <DashboardShell
    :title="t('dashboard.coach')"
    :items="nav"
    :wide="true"
    :dark-nav="false"
    hide-mobile-header
    phone-shell
    hide-user
  >
    <CanvaCoachPhotoHero v-if="showLayoutPhotoHero" />
    <slot />
  </DashboardShell>
</template>
