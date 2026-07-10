<script setup lang="ts">
import { ALL_OWNER_PERMISSIONS, parsePermissions, type OwnerPermission } from '#shared/ownerPermissions.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatHours } = useFormatters()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/settings')
useOwnerClubRefresh(refresh)

const isOwner = computed(() => data.value?.membership?.role === 'OWNER')
const { data: staffData, refresh: refreshStaff } = await useAuthedFetch('/api/owner/staff', {
  immediate: false,
  watch: false,
})
const staffSaving = ref<Record<string, boolean>>({})
const staffError = ref('')
const staffSuccess = ref('')

watch(isOwner, (owner) => {
  if (owner) refreshStaff()
}, { immediate: true })

const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)

const form = reactive({
  nameFa: '',
  nameEn: '',
  addressFa: '',
  addressEn: '',
  city: '',
  district: '',
  openHour: 8,
  closeHour: 22,
  cancellationWindowHours: 12,
  rescheduleWindowHours: 24,
  waitlistEnabled: true,
  phone: '',
  whatsapp: '',
})

function staffRoleLabel(role?: string) {
  if (!role) return ''
  const key = `owner.roles.${role}` as const
  const translated = t(key)
  return translated === key ? role : translated
}

function permissionLabel(permission: OwnerPermission) {
  return t(`owner.permissions.${permission}`)
}

function memberPermissions(member: { role: string; permissionsJson?: string | null }) {
  if (member.role === 'OWNER') return [...ALL_OWNER_PERMISSIONS]
  return parsePermissions(member.permissionsJson)
}

function isPermissionChecked(member: { role: string; permissionsJson?: string | null }, permission: OwnerPermission) {
  return memberPermissions(member).includes(permission)
}

function toggleMemberPermission(member: { id: string; role: string; permissionsJson?: string | null }, permission: OwnerPermission) {
  if (member.role === 'OWNER') return
  const current = memberPermissions(member)
  const next = current.includes(permission)
    ? current.filter((item) => item !== permission)
    : [...current, permission]
  if (!staffData.value?.staff) return
  const target = staffData.value.staff.find((item) => item.id === member.id)
  if (target) target.permissionsJson = JSON.stringify(next)
}

async function saveMemberPermissions(member: { id: string; role: string; permissionsJson?: string | null }) {
  if (member.role === 'OWNER') return
  staffSaving.value[member.id] = true
  staffError.value = ''
  staffSuccess.value = ''
  try {
    const permissions = parsePermissions(member.permissionsJson)
    await $fetch(`/api/owner/staff/${member.id}`, {
      method: 'PATCH',
      body: { permissions },
    })
    staffSuccess.value = t('common.saved')
    await refreshStaff()
  } catch {
    staffError.value = t('common.error')
  } finally {
    staffSaving.value[member.id] = false
  }
}

function applyClubData() {
  const club = data.value?.club
  if (!club) return
  form.nameFa = club.nameFa || ''
  form.nameEn = club.nameEn || ''
  form.addressFa = club.addressFa || ''
  form.addressEn = club.addressEn || ''
  form.city = club.city || ''
  form.district = club.district || ''
  form.openHour = club.openHour ?? 8
  form.closeHour = club.closeHour ?? 22
  form.cancellationWindowHours = club.cancellationWindowHours ?? 12
  form.rescheduleWindowHours = club.rescheduleWindowHours ?? 24
  form.waitlistEnabled = club.waitlistEnabled ?? true
  form.phone = club.phone || ''
  form.whatsapp = club.whatsapp || ''
}

watch(data, applyClubData, { immediate: true })

async function save() {
  saving.value = true
  saveError.value = ''
  saveSuccess.value = false
  try {
    await $fetch('/api/owner/settings', {
      method: 'PATCH',
      body: {
        nameFa: form.nameFa,
        nameEn: form.nameEn,
        addressFa: form.addressFa,
        addressEn: form.addressEn,
        city: form.city,
        district: form.district || null,
        openHour: Number(form.openHour),
        closeHour: Number(form.closeHour),
        cancellationWindowHours: Number(form.cancellationWindowHours),
        rescheduleWindowHours: Number(form.rescheduleWindowHours),
        waitlistEnabled: form.waitlistEnabled,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
      },
    })
    saveSuccess.value = true
    await refresh()
  } catch {
    saveError.value = t('common.error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-4">
    <PageHeaderNav :title="t('owner.settings')" :home-to="localePath('/')" :back-to="localePath('/owner')" />

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
    <form class="grid gap-4 md:grid-cols-2" @submit.prevent="save">
      <div class="ios-card p-6 md:col-span-2">
        <h2 class="font-bold">{{ t('owner.settingsPage.clubProfile') }}</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.nameFa') }}</span>
            <input v-model="form.nameFa" required class="neo-input">
          </label>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.nameEn') }}</span>
            <input v-model="form.nameEn" required dir="ltr" class="neo-input">
          </label>
          <label class="block text-sm sm:col-span-2">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.slug') }}</span>
            <input :value="data?.club?.slug" readonly dir="ltr" class="neo-input bg-brand-lavender/40 tabular-nums">
          </label>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.role') }}</span>
            <input :value="staffRoleLabel(data?.membership?.role)" readonly class="neo-input bg-brand-lavender/40">
          </label>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.city') }}</span>
            <input v-model="form.city" required class="neo-input">
          </label>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.district') }}</span>
            <input v-model="form.district" class="neo-input">
          </label>
          <label class="block text-sm sm:col-span-2">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.addressFa') }}</span>
            <input v-model="form.addressFa" required class="neo-input">
          </label>
          <label class="block text-sm sm:col-span-2">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.addressEn') }}</span>
            <input v-model="form.addressEn" required dir="ltr" class="neo-input">
          </label>
        </div>
      </div>

      <div class="ios-card p-6">
        <h2 class="font-bold">{{ t('owner.settingsPage.operations') }}</h2>
        <div class="mt-3 space-y-3 text-sm">
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="mb-1 block font-bold">{{ t('owner.settingsPage.openHour') }}</span>
              <input v-model.number="form.openHour" type="number" min="0" max="23" required dir="ltr" class="neo-input tabular-nums">
            </label>
            <label class="block">
              <span class="mb-1 block font-bold">{{ t('owner.settingsPage.closeHour') }}</span>
              <input v-model.number="form.closeHour" type="number" min="1" max="24" required dir="ltr" class="neo-input tabular-nums">
            </label>
          </div>
          <label class="block">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.cancellation') }}</span>
            <input v-model.number="form.cancellationWindowHours" type="number" min="0" required dir="ltr" class="neo-input tabular-nums">
            <span class="mt-1 block text-xs text-brand-gray-600">{{ formatHours(form.cancellationWindowHours) }}</span>
          </label>
          <label class="block">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.reschedule') }}</span>
            <input v-model.number="form.rescheduleWindowHours" type="number" min="0" required dir="ltr" class="neo-input tabular-nums">
            <span class="mt-1 block text-xs text-brand-gray-600">{{ formatHours(form.rescheduleWindowHours) }}</span>
          </label>
          <label class="flex items-center gap-2">
            <input v-model="form.waitlistEnabled" type="checkbox" class="rounded">
            <span class="font-bold">{{ t('owner.settingsPage.waitlist') }}</span>
          </label>
          <p class="text-brand-gray-600">
            <span class="font-bold">{{ t('owner.settingsPage.inventory') }}:</span>
            {{ data?.counts?.courts || 0 }} {{ t('owner.settingsPage.courts') }} · {{ data?.counts?.coaches || 0 }} {{ t('owner.settingsPage.coaches') }}
          </p>
        </div>
      </div>

      <div class="ios-card p-6">
        <h2 class="font-bold">{{ t('owner.settingsPage.contacts') }}</h2>
        <div class="mt-3 space-y-3 text-sm">
          <label class="block">
            <span class="mb-1 block font-bold">{{ t('common.mobile') }}</span>
            <input v-model="form.phone" dir="ltr" class="neo-input tabular-nums">
          </label>
          <label class="block">
            <span class="mb-1 block font-bold">{{ t('common.whatsapp') }}</span>
            <input v-model="form.whatsapp" dir="ltr" class="neo-input tabular-nums">
          </label>
        </div>
      </div>

      <div v-if="isOwner" class="ios-card p-6 md:col-span-2">
        <h2 class="font-bold">{{ t('owner.settingsPage.staffAccess') }}</h2>
        <p class="mt-1 text-sm text-brand-gray-600">{{ t('owner.settingsPage.staffAccessHint') }}</p>
        <p v-if="staffError" class="mt-3 text-sm text-red-600">{{ staffError }}</p>
        <p v-if="staffSuccess" class="mt-3 text-sm text-green-700">{{ staffSuccess }}</p>
        <ul class="mt-4 space-y-3">
          <li v-for="member in staffData?.staff || []" :key="member.id" class="ios-card p-4">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="font-bold">{{ member.coach ? localizedField(member.coach, 'nameFa', 'nameEn') : member.user.name }}</p>
                <p class="text-xs text-brand-gray-600">
                  <span class="rounded-full bg-brand-cream px-2 py-0.5 font-semibold">{{ staffRoleLabel(member.role) }}</span>
                  <span class="ms-2"><bdi dir="ltr" class="tabular-nums">{{ member.user.phone || member.user.email }}</bdi></span>
                </p>
              </div>
              <button
                v-if="member.role !== 'OWNER'"
                type="button"
                class="btn-secondary text-xs"
                :disabled="staffSaving[member.id]"
                @click="saveMemberPermissions(member)"
              >
                {{ staffSaving[member.id] ? t('common.loading') : t('common.save') }}
              </button>
            </div>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <label
                v-for="permission in ALL_OWNER_PERMISSIONS"
                :key="`${member.id}-${permission}`"
                class="flex items-center gap-2 text-sm"
                :class="member.role === 'OWNER' ? 'opacity-70' : ''"
              >
                <input
                  type="checkbox"
                  :checked="isPermissionChecked(member, permission)"
                  :disabled="member.role === 'OWNER'"
                  @change="toggleMemberPermission(member, permission)"
                >
                <span>{{ permissionLabel(permission) }}</span>
              </label>
            </div>
            <p v-if="member.role === 'OWNER'" class="mt-2 text-xs text-brand-gray-500">{{ t('owner.settingsPage.ownerPermissionsReadonly') }}</p>
          </li>
          <li v-if="!(staffData?.staff || []).length" class="ios-card p-4 text-sm text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </div>

      <div class="md:col-span-2">
        <p v-if="saveError" class="mb-2 text-sm text-red-600">{{ saveError }}</p>
        <p v-if="saveSuccess" class="mb-2 text-sm text-green-700">{{ t('common.saved') }}</p>
        <button type="submit" class="btn-primary w-full sm:w-auto" :disabled="saving">
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </form>
    </AppAsyncState>
  </div>
</template>
