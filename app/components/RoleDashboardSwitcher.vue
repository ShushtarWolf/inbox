<script setup lang="ts">
import { type PlatformRole } from '#shared/roles.ts'

const props = defineProps<{
  /** Dashboard the user is currently viewing. */
  current: PlatformRole
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { openRegister } = useAuthFlow()
const { pilotNoCoach } = usePilotFlags()
const {
  heldRoles,
  roleCardState,
  pathForRole,
  rememberRole,
  canOfferCoach,
  canOfferOwner,
  showNewRoleSection,
} = usePlatformRoles()

const switchTargets = computed(() => {
  const candidates: Array<{ role: PlatformRole; label: string; to: string; pending: boolean }> = []
  for (const role of heldRoles.value) {
    if (role === props.current) continue
    if (role === 'COACH' && pilotNoCoach.value) continue
    candidates.push({
      role,
      label: role === 'ATHLETE'
        ? t('auth.switchToAthlete')
        : role === 'COACH'
          ? t('auth.switchToCoach')
          : t('auth.switchToOwner'),
      to: localePath(pathForRole(role)),
      pending: roleCardState(role) === 'pending',
    })
  }
  return candidates
})

function onSwitch(role: PlatformRole) {
  rememberRole(role)
}

/** Open register sheet in-place — do not navigate to /register/* (guest middleware bounces logged-in users). */
function applyCoach() {
  openRegister({ role: 'COACH', returnTo: localePath('/coach') })
}

function applyOwner() {
  openRegister({ role: 'CLUB_ADMIN', returnTo: localePath('/owner') })
}
</script>

<template>
  <div v-if="switchTargets.length || showNewRoleSection()" class="space-y-2">
    <template v-if="switchTargets.length">
      <p class="text-xs text-brand-gray-600 text-start">{{ t('auth.switchRoleHint') }}</p>
      <NuxtLink
        v-for="target in switchTargets"
        :key="target.role"
        :to="target.to"
        class="canva-gate-btn-primary block w-full text-center text-sm"
        @click="onSwitch(target.role)"
      >
        {{ target.label }}
        <span v-if="target.pending" class="ms-1 text-[11px] font-semibold opacity-90">
          ({{ t('auth.chooseRole.badgePending') }})
        </span>
      </NuxtLink>
    </template>

    <template v-if="showNewRoleSection()">
      <p class="pt-2 text-xs font-bold text-brand-navy text-start">{{ t('auth.chooseRole.newRoleTitle') }}</p>
      <button
        v-if="canOfferCoach()"
        type="button"
        class="canva-gate-btn-secondary block w-full text-center text-sm"
        @click="applyCoach"
      >
        {{ t('auth.chooseRole.applyCoach') }}
      </button>
      <button
        v-if="canOfferOwner()"
        type="button"
        class="canva-gate-btn-secondary block w-full text-center text-sm"
        @click="applyOwner"
      >
        {{ t('auth.chooseRole.applyOwner') }}
      </button>
    </template>
  </div>
</template>
