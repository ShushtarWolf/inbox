<script setup lang="ts">
import { ALL_OWNER_PERMISSIONS, BASE_OWNER_PERMISSIONS, FINANCE_SUB_PERMISSIONS, parsePermissions, type OwnerPermission } from '#shared/ownerPermissions.ts'
import { COURT_FACILITY_OPTIONS, DEFAULT_SESSION_DURATIONS, parseFacilitiesJson, parseSessionDurationsJson } from '#shared/courtFacilities.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatHours } = useFormatters()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/settings')
const { data: courtsData, refresh: refreshCourts } = await useAuthedFetch('/api/owner/courts')
useOwnerClubRefresh(() => { refresh(); refreshCourts() })

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
const courtSaving = ref(false)
const courtError = ref('')
const editingCourtId = ref<string | null>(null)
const showCourtForm = ref(false)

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
  image: '',
  amenities: [] as string[],
  sessionDurations: [60] as number[],
  defaultSessionDurationMinutes: 60,
})

function staffRoleLabel(role?: string) {
  if (!role) return ''
  const key = `owner.roles.${role}` as const
  const translated = t(key)
  return translated === key ? role : translated
}

function permissionLabel(permission: OwnerPermission | string) {
  return t(`owner.permissions.${permission}`)
}

function memberPermissions(member: { role: string; permissionsJson?: string | null }) {
  if (member.role === 'OWNER') return [...ALL_OWNER_PERMISSIONS, 'finance' as OwnerPermission]
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
  form.image = club.image || ''
  form.amenities = parseFacilitiesJson((club as { amenitiesJson?: string }).amenitiesJson)
  form.sessionDurations = parseSessionDurationsJson((club as { sessionDurationsJson?: string }).sessionDurationsJson)
  form.defaultSessionDurationMinutes = (club as { defaultSessionDurationMinutes?: number }).defaultSessionDurationMinutes ?? 60
}

function toggleAmenity(slug: string) {
  if (form.amenities.includes(slug)) {
    form.amenities = form.amenities.filter((item) => item !== slug)
  } else {
    form.amenities = [...form.amenities, slug]
  }
}

function toggleSessionDuration(minutes: number) {
  if (form.sessionDurations.includes(minutes)) {
    const next = form.sessionDurations.filter((item) => item !== minutes)
    form.sessionDurations = next.length ? next : [minutes]
  } else {
    form.sessionDurations = [...form.sessionDurations, minutes].sort((a, b) => a - b)
  }
  if (!form.sessionDurations.includes(form.defaultSessionDurationMinutes)) {
    form.defaultSessionDurationMinutes = form.sessionDurations[0] || 60
  }
}

async function saveCourt(body: Record<string, unknown>) {
  courtSaving.value = true
  courtError.value = ''
  try {
    if (editingCourtId.value) {
      await $fetch(`/api/owner/courts/${editingCourtId.value}`, { method: 'PATCH', body })
    } else {
      await $fetch('/api/owner/courts', { method: 'POST', body })
    }
    editingCourtId.value = null
    showCourtForm.value = false
    await refreshCourts()
    await refresh()
  } catch {
    courtError.value = t('common.error')
  } finally {
    courtSaving.value = false
  }
}

async function deleteCourt(id: string) {
  if (!confirm(t('owner.settingsPage.confirmDeleteCourt'))) return
  courtSaving.value = true
  courtError.value = ''
  try {
    await $fetch(`/api/owner/courts/${id}`, { method: 'DELETE' })
    editingCourtId.value = null
    showCourtForm.value = false
    await refreshCourts()
    await refresh()
  } catch {
    courtError.value = t('common.error')
  } finally {
    courtSaving.value = false
  }
}

function startEditCourt(court: { id: string }) {
  editingCourtId.value = court.id
  showCourtForm.value = true
}

function startCreateCourt() {
  editingCourtId.value = null
  showCourtForm.value = true
}

const galleryUrl = ref('')

watch(data, applyClubData, { immediate: true })

async function addGalleryImage(url: string) {
  if (!url) return
  await $fetch('/api/owner/media', { method: 'POST', body: { url } })
  galleryUrl.value = ''
  await refresh()
}

async function removeGalleryImage(id: string) {
  await $fetch(`/api/owner/media/${id}`, { method: 'DELETE' })
  await refresh()
}

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
        image: form.image || null,
        amenitiesJson: JSON.stringify(form.amenities),
        sessionDurationsJson: JSON.stringify(form.sessionDurations),
        defaultSessionDurationMinutes: form.defaultSessionDurationMinutes,
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
            <AppImageUpload v-model="form.image" :label="t('owner.settingsPage.imageUrl')" placeholder="/placeholders/club.svg" />
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

      <div class="ios-card p-6 md:col-span-2">
        <h2 class="font-bold">{{ t('owner.settingsPage.sessionDurations') }}</h2>
        <p class="mt-1 text-sm text-brand-gray-600">{{ t('owner.settingsPage.sessionDurationsHint') }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="minutes in DEFAULT_SESSION_DURATIONS"
            :key="minutes"
            type="button"
            class="neo-pill"
            :class="form.sessionDurations.includes(minutes) ? 'neo-pill-active' : 'neo-pill-inactive'"
            @click="toggleSessionDuration(minutes)"
          >
            {{ minutes }} {{ t('owner.settingsPage.minutes') }}
          </button>
        </div>
        <label class="mt-3 block text-sm">
          <span class="mb-1 block font-bold">{{ t('owner.settingsPage.defaultSessionDuration') }}</span>
          <select v-model.number="form.defaultSessionDurationMinutes" class="neo-select">
            <option v-for="minutes in form.sessionDurations" :key="minutes" :value="minutes">
              {{ minutes }} {{ t('owner.settingsPage.minutes') }}
            </option>
          </select>
        </label>
      </div>

      <div class="ios-card p-6 md:col-span-2">
        <h2 class="font-bold">{{ t('owner.settingsPage.amenities') }}</h2>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="facility in COURT_FACILITY_OPTIONS"
            :key="facility.slug"
            type="button"
            class="neo-pill"
            :class="form.amenities.includes(facility.slug) ? 'neo-pill-active' : 'neo-pill-inactive'"
            @click="toggleAmenity(facility.slug)"
          >
            {{ localizedField(facility, 'nameFa', 'nameEn') }}
          </button>
        </div>
      </div>

      <div class="ios-card p-6 md:col-span-2">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-bold">{{ t('owner.settingsPage.courtsSection') }}</h2>
          <button type="button" class="btn-secondary text-sm" @click="startCreateCourt">{{ t('owner.settingsPage.addCourt') }}</button>
        </div>
        <p v-if="courtError" class="mt-2 text-sm text-red-600">{{ courtError }}</p>
        <ul class="mt-3 space-y-2">
          <li
            v-for="court in courtsData || []"
            :key="court.id"
            class="flex items-center justify-between gap-2 rounded-venus border border-brand-gray-100 px-3 py-2"
          >
            <div>
              <p class="font-bold">{{ localizedField(court, 'nameFa', 'nameEn') }}</p>
              <p class="text-xs text-brand-gray-600">
                {{ court.openHour ?? form.openHour }}:00 – {{ court.closeHour ?? form.closeHour }}:00
                · {{ t('owner.settingsPage.courtPrice') }}: {{ court.price.toLocaleString() }}
              </p>
            </div>
            <button type="button" class="btn-ghost text-xs" @click="startEditCourt(court)">{{ t('common.edit') }}</button>
          </li>
        </ul>
        <div v-if="showCourtForm" class="mt-4 border-t border-brand-gray-100 pt-4">
          <OwnerCourtForm
            :court="editingCourtId ? (courtsData || []).find((c: { id: string }) => c.id === editingCourtId) : null"
            :club-open-hour="form.openHour"
            :club-close-hour="form.closeHour"
            :saving="courtSaving"
            @save="saveCourt"
            @cancel="showCourtForm = false; editingCourtId = null"
            @delete="deleteCourt"
          />
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

      <div class="ios-card p-6 md:col-span-2">
        <h2 class="font-bold">{{ t('register.clubGallery') }}</h2>
        <div class="mt-3 flex flex-wrap gap-2">
          <div v-for="item in data?.club?.media || []" :key="item.id">
            <img :src="item.url" alt="" class="h-20 w-20 object-cover border" />
            <button type="button" class="mt-1 block text-xs text-red-600" @click="removeGalleryImage(item.id)">
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
        <div class="mt-3 space-y-2">
          <AppImageUpload v-model="galleryUrl" />
          <button type="button" class="btn-secondary" :disabled="!galleryUrl" @click="addGalleryImage(galleryUrl)">
            {{ t('upload.addPhoto') }}
          </button>
        </div>
      </div>

      <div v-if="isOwner" class="ios-card p-6 md:col-span-2">
        <h2 class="font-bold">{{ t('owner.settingsPage.workersSection') }}</h2>
        <OwnerWorkersPanel embedded />
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
                v-for="permission in BASE_OWNER_PERMISSIONS"
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
            <div class="mt-4">
              <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.permissions.financeGroup') }}</p>
              <div class="grid gap-2 sm:grid-cols-2">
                <label
                  v-for="permission in FINANCE_SUB_PERMISSIONS"
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
            </div>
            <p v-if="member.role === 'OWNER'" class="mt-2 text-xs text-brand-gray-500">{{ t('owner.settingsPage.ownerPermissionsReadonly') }}</p>
          </li>
          <li v-if="!(staffData?.staff || []).length" class="ios-card p-4 text-sm text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </div>

      <div class="md:col-span-2">
        <p v-if="saveError" class="mb-2 text-sm text-red-600">{{ saveError }}</p>
        <p v-if="saveSuccess" class="mb-2 text-sm text-green-700">{{ t('common.saved') }}</p>
        <button type="submit" class="btn-primary venus-sticky-action w-full sm:w-auto" :disabled="saving">
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </form>
    </AppAsyncState>
  </div>
</template>
