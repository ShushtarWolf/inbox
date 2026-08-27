<script setup lang="ts">
import { hasRole, type PlatformRole } from '#shared/roles.ts'
import { roleDashboardPath } from '#shared/returnTo.ts'

const props = defineProps<{
  /** Dashboard the user is currently viewing. */
  current: PlatformRole
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { user } = useAuth()
const { pilotNoCoach } = usePilotFlags()

const switchTargets = computed(() => {
  const session = user.value
  if (!session?.role) return []

  const rolesUser = { role: session.role, secondaryRole: session.secondaryRole }
  const candidates: Array<{ role: PlatformRole; label: string; to: string }> = []

  if (props.current !== 'ATHLETE' && hasRole(rolesUser, 'ATHLETE')) {
    candidates.push({
      role: 'ATHLETE',
      label: t('auth.switchToAthlete'),
      to: localePath(roleDashboardPath('ATHLETE')),
    })
  }
  if (
    props.current !== 'COACH'
    && hasRole(rolesUser, 'COACH')
    && !pilotNoCoach.value
  ) {
    candidates.push({
      role: 'COACH',
      label: t('auth.switchToCoach'),
      to: localePath(roleDashboardPath('COACH')),
    })
  }
  if (props.current !== 'CLUB_ADMIN' && hasRole(rolesUser, 'CLUB_ADMIN')) {
    candidates.push({
      role: 'CLUB_ADMIN',
      label: t('auth.switchToOwner'),
      to: localePath(roleDashboardPath('CLUB_ADMIN')),
    })
  }

  return candidates
})
</script>

<template>
  <div v-if="switchTargets.length" class="space-y-2">
    <p class="text-xs text-brand-gray-600 text-start">{{ t('auth.switchRoleHint') }}</p>
    <NuxtLink
      v-for="target in switchTargets"
      :key="target.role"
      :to="target.to"
      class="canva-gate-btn-primary block w-full text-center text-sm"
    >
      {{ target.label }}
    </NuxtLink>
  </div>
</template>
