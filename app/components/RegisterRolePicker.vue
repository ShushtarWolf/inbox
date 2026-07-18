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

const roles = computed(() =>
  pilotNoCoach.value ? allRoles.filter((item) => item.id !== 'coach') : allRoles,
)

function roleLink(path: string) {
  const returnTo = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''
  return localePath({ path, query: returnTo ? { returnTo } : {} })
}
</script>

<template>
  <div class="flex flex-wrap gap-2" role="tablist" :aria-label="t('register.rolePickerLabel')">
    <NuxtLink
      v-for="role in roles"
      :key="role.id"
      :to="roleLink(role.path)"
      class="neo-pill min-w-0 flex-1 text-center text-xs sm:text-sm"
      :class="active === role.id ? 'neo-pill-active' : 'neo-pill-inactive'"
      role="tab"
      :aria-selected="active === role.id"
    >
      {{ t(role.labelKey) }}
    </NuxtLink>
  </div>
</template>
