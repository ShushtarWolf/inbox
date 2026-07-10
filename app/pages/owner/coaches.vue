<script setup lang="ts">
import { ALL_OWNER_PERMISSIONS, defaultPermissionsForRole, parsePermissions, type OwnerPermission } from '#shared/ownerPermissions.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })
const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/staff')
useOwnerClubRefresh(refresh)
const { formatIsoDate, formatTimeRange } = useFormatters()
const { localizedField } = useLocalizedField()

const inviteEmail = ref('')
const inviteName = ref('')
const inviteRole = ref('COACH')
const invitePermissions = ref<OwnerPermission[]>(defaultPermissionsForRole('COACH'))
const inviting = ref(false)
const inviteError = ref('')
const inviteResult = ref('')

watch(inviteRole, (role) => {
  invitePermissions.value = [...defaultPermissionsForRole(role)]
})

function staffRoleLabel(role: string) {
  const key = `owner.roles.${role}` as const
  const translated = t(key)
  return translated === key ? role : translated
}

function permissionLabel(permission: OwnerPermission) {
  return t(`owner.permissions.${permission}`)
}

function toggleInvitePermission(permission: OwnerPermission) {
  if (invitePermissions.value.includes(permission)) {
    invitePermissions.value = invitePermissions.value.filter((item) => item !== permission)
  } else {
    invitePermissions.value = [...invitePermissions.value, permission]
  }
}

async function sendInvite() {
  inviting.value = true
  inviteError.value = ''
  inviteResult.value = ''
  try {
    const res = await $fetch<{ temporaryPassword?: string }>('/api/owner/coaches/invite', {
      method: 'POST',
      body: {
        email: inviteEmail.value,
        name: inviteName.value,
        role: inviteRole.value,
        permissions: invitePermissions.value,
      },
    })
    inviteResult.value = res.temporaryPassword
      ? t('owner.inviteCreated', { password: res.temporaryPassword })
      : t('owner.inviteSent')
    inviteEmail.value = ''
    inviteName.value = ''
    invitePermissions.value = [...defaultPermissionsForRole(inviteRole.value)]
    await refresh()
  } catch {
    inviteError.value = t('common.error')
  } finally {
    inviting.value = false
  }
}

async function deactivate(memberId: string) {
  await $fetch(`/api/owner/coaches/${memberId}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="mb-4 font-display text-xl font-black">{{ $t('owner.coaches') }}</h1>
    <AppVenusSkeleton v-if="pending" :lines="3" />
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>
    <div v-else class="grid gap-4 lg:grid-cols-2">
      <section class="ios-card p-4">
        <h2 class="mb-3 font-bold">{{ t('owner.inviteStaff') }}</h2>
        <div class="space-y-2">
          <input v-model="inviteEmail" type="email" :placeholder="t('auth.email')" class="neo-input" />
          <input v-model="inviteName" :placeholder="t('auth.name')" class="neo-input" />
          <select v-model="inviteRole" class="neo-input">
            <option value="COACH">{{ t('owner.roles.COACH') }}</option>
            <option value="MANAGER">{{ t('owner.roles.MANAGER') }}</option>
            <option value="FRONT_DESK">{{ t('owner.roles.FRONT_DESK') }}</option>
          </select>
          <div class="ios-card bg-brand-lavender/40 p-3">
            <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.permissionsTitle') }}</p>
            <div class="grid gap-2 sm:grid-cols-2">
              <label v-for="permission in ALL_OWNER_PERMISSIONS" :key="permission" class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  :checked="invitePermissions.includes(permission)"
                  @change="toggleInvitePermission(permission)"
                >
                <span>{{ permissionLabel(permission) }}</span>
              </label>
            </div>
          </div>
          <p v-if="inviteError" class="text-sm text-red-600">{{ inviteError }}</p>
          <p v-if="inviteResult" class="text-sm text-brand-gray-600">{{ inviteResult }}</p>
          <button type="button" class="btn-primary w-full" :disabled="inviting" @click="sendInvite">{{ inviting ? t('common.loading') : t('owner.sendInvite') }}</button>
        </div>
        <h2 class="mb-3 mt-6 font-bold">{{ $t('owner.coaches') }}</h2>
        <ul class="space-y-2">
          <li v-for="member in data?.staff" :key="member.id" class="flex items-start justify-between gap-2 ios-card p-3">
            <div>
              <p class="font-bold">{{ member.coach ? localizedField(member.coach, 'nameFa', 'nameEn') : member.user.name }}</p>
              <p class="text-xs text-brand-gray-600">{{ staffRoleLabel(member.role) }} · <bdi dir="ltr" class="tabular-nums">{{ member.user.phone || member.user.email }}</bdi></p>
              <p v-if="member.permissionsJson" class="mt-1 text-[11px] text-brand-gray-500">
                {{ parsePermissions(member.permissionsJson).map((p) => permissionLabel(p as OwnerPermission)).join(' · ') }}
              </p>
            </div>
            <button v-if="member.role !== 'OWNER'" type="button" class="text-xs text-red-600" @click="deactivate(member.id)">{{ t('owner.deactivate') }}</button>
          </li>
          <li v-if="!data?.staff?.length" class="ios-card p-3 text-sm text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </section>
      <section class="ios-card p-4">
        <h2 class="mb-3 font-bold">{{ $t('coach.schedule') }}</h2>
        <ul class="space-y-2 text-sm">
          <li v-for="session in data?.upcomingSessions" :key="session.id" class="ios-card p-3">
            <p class="font-bold">{{ localizedField(session.coach, 'nameFa', 'nameEn') }}</p>
            <p class="text-brand-gray-600" dir="auto">{{ formatIsoDate(session.date) }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(session.startTime) }}</bdi></p>
          </li>
          <li v-if="!data?.upcomingSessions?.length" class="ios-card p-3 text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>
