<script setup lang="ts">
type RegisterRole = 'athlete' | 'owner' | 'coach'

defineProps<{
  active?: RegisterRole
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { pilotNoCoach } = usePilotFlags()

const allRoles: Array<{ id: RegisterRole; labelKey: string; path: string }> = [
  { id: 'athlete', labelKey: 'register.roleAthlete', path: '/register' },
  { id: 'owner', labelKey: 'register.roleOwner', path: '/register/owner' },
  { id: 'coach', labelKey: 'register.roleCoach', path: '/register/coach' },
]

/** Coach signup is open but admin-reviewed; it follows the pilot flag like AuthFlowModal. */
const roles = computed(() => (pilotNoCoach.value ? allRoles.filter((item) => item.id !== 'coach') : allRoles))

function roleLink(path: string) {
  const returnTo = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''
  return localePath({ path, query: returnTo ? { returnTo } : {} })
}
</script>

<template>
  <div
    class="grid gap-2"
    :class="roles.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'"
    role="tablist"
    :aria-label="t('register.rolePickerLabel')"
  >
    <NuxtLink
      v-for="role in roles"
      :key="role.id"
      :to="roleLink(role.path)"
      class="canva-court-chip text-center text-xs sm:text-sm"
      :class="active === role.id ? 'canva-court-chip-active' : 'canva-court-chip-idle'"
      role="tab"
      :aria-selected="active === role.id"
    >
      {{ t(role.labelKey) }}
    </NuxtLink>
  </div>
</template>
