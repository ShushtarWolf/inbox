<script setup lang="ts">
import { ALL_OWNER_PERMISSIONS, defaultPermissionsForRole, parsePermissions, type OwnerPermission } from '#shared/ownerPermissions.ts'
import { fetchErrorMessage } from '~/composables/useFetchError'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })
const { t } = useI18n()

type OwnerStaffMember = {
  id: string
  role: string
  permissionsJson?: string | null
  user: { name: string; phone?: string | null; email?: string | null }
  coach?: { nameFa?: string | null; nameEn?: string | null } | null
}

type OwnerStaffPage = {
  staff: OwnerStaffMember[]
  upcomingSessions: Array<{
    id: string
    date: string
    startTime: string
    coach: { nameFa?: string | null; nameEn?: string | null }
  }>
}

type CoachLink = {
  id: string
  status: 'PENDING' | 'ACTIVE' | 'BLOCKED'
  courtDiscountPercent: number
  coach: {
    id: string
    nameFa: string
    nameEn: string
    city: string
    sessionPrice: number
    photo: string | null
    phone: string | null
    email: string | null
  }
}

const { data, pending, error, refresh } = await useAuthedFetch<OwnerStaffPage>('/api/owner/staff')
const { data: linkData, refresh: refreshLinks } = await useAuthedFetch<{ links: CoachLink[] }>('/api/owner/coach-links')
useOwnerClubRefresh(refresh)
useOwnerClubRefresh(refreshLinks)
const { formatIsoDate, formatTimeRange, formatCurrency } = useFormatters()
const { localizedField } = useLocalizedField()

const linkBusyId = ref('')
const discountDrafts = reactive<Record<string, number>>({})

watch(linkData, (value) => {
  for (const link of value?.links || []) {
    if (discountDrafts[link.id] === undefined) discountDrafts[link.id] = link.courtDiscountPercent
  }
}, { immediate: true })

async function updateLink(link: CoachLink, patch: { status?: CoachLink['status']; courtDiscountPercent?: number }) {
  if (linkBusyId.value) return
  linkBusyId.value = link.id
  try {
    await $fetch(`/api/owner/coach-links/${link.id}`, { method: 'PATCH', body: patch })
    await refreshLinks()
  } finally {
    linkBusyId.value = ''
  }
}

const invitePhone = ref('')
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
    const res = await $fetch<{ phone?: string; created?: boolean }>('/api/owner/coaches/invite', {
      method: 'POST',
      body: {
        phone: invitePhone.value,
        name: inviteName.value,
        role: inviteRole.value,
        permissions: invitePermissions.value,
      },
    })
    inviteResult.value = res.created
      ? t('owner.inviteCreated')
      : t('owner.inviteSent')
    invitePhone.value = ''
    inviteName.value = ''
    invitePermissions.value = [...defaultPermissionsForRole(inviteRole.value)]
    await refresh()
  } catch (err) {
    inviteError.value = fetchErrorMessage(err, t('common.error'), t)
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
  <div class="venus-page-stack">
    <h1 class="mb-4 font-display text-xl font-bold">{{ $t('owner.coaches') }}</h1>
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="table">
    <div class="grid gap-4 lg:grid-cols-2">
      <section class="ios-card p-4">
        <h2 class="mb-3 font-bold">{{ t('owner.inviteStaff') }}</h2>
        <div class="venus-form-stack">
          <AppFormField :label="t('common.mobile')" required>
            <input
              v-model="invitePhone"
              type="tel"
              inputmode="numeric"
              dir="ltr"
              class="neo-input"
              autocomplete="tel"
              :placeholder="t('auth.phonePlaceholder')"
            />
          </AppFormField>
          <AppFormField :label="t('auth.name')" required>
            <input v-model="inviteName" class="neo-input" autocomplete="name" />
          </AppFormField>
          <AppFormField :label="t('owner.settingsPage.role')">
            <select v-model="inviteRole" class="neo-select">
            <option value="COACH">{{ t('owner.roles.COACH') }}</option>
            <option value="MANAGER">{{ t('owner.roles.MANAGER') }}</option>
            <option value="FRONT_DESK">{{ t('owner.roles.FRONT_DESK') }}</option>
          </select>
          </AppFormField>
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
          <button type="button" class="btn-primary w-full" :disabled="inviting || !invitePhone.trim() || !inviteName.trim()" @click="sendInvite">{{ inviting ? t('common.loading') : t('owner.sendInvite') }}</button>
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
        <h2 class="mb-1 font-bold">{{ t('owner.coachLinksTitle') }}</h2>
        <p class="mb-3 text-xs text-brand-gray-600">{{ t('owner.coachLinksHint') }}</p>
        <ul class="space-y-2">
          <li v-for="link in linkData?.links" :key="link.id" class="ios-card p-3">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="font-bold">{{ localizedField(link.coach, 'nameFa', 'nameEn') }}</p>
                <p class="text-xs text-brand-gray-600">
                  {{ link.coach.city }} · {{ formatCurrency(link.coach.sessionPrice) }}
                </p>
              </div>
              <span class="text-xs font-bold" :class="link.status === 'ACTIVE' ? 'text-emerald-700' : 'text-brand-gray-500'">
                {{ t(`owner.coachLinkStatus.${link.status}`) }}
              </span>
            </div>
            <div class="mt-2 flex flex-wrap items-end gap-2">
              <AppFormField :label="t('owner.coachCourtDiscount')" class="min-w-[140px] flex-1">
                <input
                  v-model.number="discountDrafts[link.id]"
                  type="number"
                  min="0"
                  max="100"
                  class="neo-input"
                  :disabled="linkBusyId === link.id"
                >
              </AppFormField>
              <button
                type="button"
                class="btn-primary px-3 py-2 text-xs"
                :disabled="linkBusyId === link.id"
                @click="updateLink(link, { courtDiscountPercent: discountDrafts[link.id] })"
              >{{ t('common.save') }}</button>
              <button
                v-if="link.status !== 'ACTIVE'"
                type="button"
                class="text-xs font-bold text-emerald-700"
                :disabled="linkBusyId === link.id"
                @click="updateLink(link, { status: 'ACTIVE' })"
              >{{ t('owner.coachLinkAccept') }}</button>
              <button
                v-if="link.status !== 'BLOCKED'"
                type="button"
                class="text-xs text-red-600"
                :disabled="linkBusyId === link.id"
                @click="updateLink(link, { status: 'BLOCKED' })"
              >{{ t('owner.coachLinkBlock') }}</button>
            </div>
          </li>
          <li v-if="!linkData?.links?.length" class="ios-card p-3 text-sm text-brand-gray-600">{{ t('owner.coachLinksEmpty') }}</li>
        </ul>

        <h2 class="mb-3 mt-6 font-bold">{{ $t('coach.schedule') }}</h2>
        <ul class="space-y-2 text-sm">
          <li v-for="session in data?.upcomingSessions" :key="session.id" class="ios-card p-3">
            <p class="font-bold">{{ localizedField(session.coach, 'nameFa', 'nameEn') }}</p>
            <p class="text-brand-gray-600" dir="auto">{{ formatIsoDate(session.date) }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(session.startTime) }}</bdi></p>
          </li>
          <li v-if="!data?.upcomingSessions?.length" class="ios-card p-3 text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </section>
    </div>
    </AppAsyncState>
  </div>
</template>
