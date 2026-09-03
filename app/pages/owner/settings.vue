<script setup lang="ts">
import {
  ALL_OWNER_PERMISSIONS,
  BASE_OWNER_PERMISSIONS,
  FINANCE_SUB_PERMISSIONS,
  defaultPermissionsForRole,
  parsePermissions,
  type OwnerPermission,
} from '#shared/ownerPermissions.ts'
import { COURT_FACILITY_OPTIONS, DEFAULT_SESSION_DURATIONS, parseFacilitiesJson, parseSessionDurationsJson } from '#shared/courtFacilities.ts'
import { isValidSheba } from '#shared/settlement.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

interface OwnerSettingsClubMedia {
  id: string
  url: string
}

interface OwnerSettingsClub {
  id: string
  slug?: string
  nameFa: string
  nameEn: string
  city: string
  district?: string | null
  addressFa: string
  addressEn?: string | null
  phone?: string | null
  whatsapp?: string | null
  image?: string | null
  openHour?: number
  closeHour?: number
  defaultSessionDurationMinutes?: number
  sessionDurationsJson?: string | null
  amenitiesJson?: string | null
  descriptionFa?: string | null
  descriptionEn?: string | null
  cancellationWindowHours?: number
  rescheduleWindowHours?: number
  waitlistEnabled?: boolean
  sheba?: string | null
  media?: OwnerSettingsClubMedia[]
}

interface OwnerSettingsResponse {
  club: OwnerSettingsClub
  membership: { role: string; isPrimary?: boolean }
  counts?: { courts: number; coaches: number }
}

interface OwnerCourtListItem {
  id: string
  nameFa: string
  nameEn: string
  price: number
  image?: string | null
  imagesJson?: string | null
  openHour?: number | null
  closeHour?: number | null
  facilitiesJson?: string | null
  pricingJson?: string | null
  sport?: { slug: string; nameFa?: string; nameEn?: string }
}

interface OwnerStaffMember {
  id: string
  role: string
  permissionsJson?: string | null
  user: {
    name: string
    nameEn?: string | null
    phone?: string | null
    email?: string | null
  }
  coach?: { id: string; nameFa: string; nameEn: string } | null
}

interface OwnerStaffResponse {
  staff: OwnerStaffMember[]
}

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatNumber, formatCurrency, formatPhone, formatFaDigits } = useFormatters()
const { fetchErrorMessage } = useFetchError()
const { pilotNoCoach } = usePilotFlags()
const { data, pending, error, refresh } = await useAuthedFetch<OwnerSettingsResponse>('/api/owner/settings')
const { data: courtsData, refresh: refreshCourts } = await useAuthedFetch<OwnerCourtListItem[]>('/api/owner/courts')
useOwnerClubRefresh(() => { refresh(); refreshCourts() })

const isOwner = computed(() => data.value?.membership?.role === 'OWNER')
const { data: staffData, refresh: refreshStaff } = await useAuthedFetch<OwnerStaffResponse>('/api/owner/staff', {
  immediate: false,
  watch: false,
})
/** Court-booking MVP: hide coach roster rows from staff-access UI. */
const staffMembers = computed(() => {
  const list = staffData.value?.staff || []
  if (!pilotNoCoach.value) return list
  return list.filter((member) => member.role !== 'COACH')
})
const staffSaving = ref<Record<string, boolean>>({})
const staffError = ref('')
const staffSuccess = ref('')
const invitePhone = ref('')
const inviteName = ref('')
const inviteRole = ref<'MANAGER' | 'FRONT_DESK' | 'ANALYST'>('FRONT_DESK')
const invitePermissions = ref<OwnerPermission[]>(defaultPermissionsForRole('FRONT_DESK'))
const inviting = ref(false)
const inviteError = ref('')
const inviteResult = ref('')

watch(inviteRole, (role) => {
  invitePermissions.value = [...defaultPermissionsForRole(role)]
})

watch(isOwner, (owner) => {
  if (owner) refreshStaff()
}, { immediate: true })

const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)
const shebaError = ref('')
const imageError = ref('')
const courtSaving = ref(false)
const courtError = ref('')
const editingCourtId = ref<string | null>(null)
const bulkEditCourts = ref(false)
const showCourtForm = ref(false)
const deleteCourtId = ref<string | null>(null)
const deletePending = ref(false)

const CANCEL_POLICY_OPTIONS = [24, 12, 0] as const

const form = reactive({
  nameFa: '',
  nameEn: '',
  sloganFa: '',
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
  sheba: '',
  amenities: [] as string[],
  sessionDurations: [60] as number[],
})

/** Canva radios ۲۴ / ۱۲ / ندارد — maps both cancel + reschedule hours. */
const cancelPolicyHours = computed({
  get() {
    const h = form.cancellationWindowHours
    if ((CANCEL_POLICY_OPTIONS as readonly number[]).includes(h)) return h
    if (h > 18) return 24
    if (h > 6) return 12
    return 0
  },
  set(value: number) {
    const hours = Number(value)
    form.cancellationWindowHours = hours
    form.rescheduleWindowHours = hours
  },
})

function cancelPolicyLabel(hours: number) {
  if (hours === 0) return t('owner.settingsPage.cancelPolicyNone')
  return t('owner.settingsPage.cancelPolicyHours', { hours: formatNumber(hours) })
}

function staffRoleLabel(role?: string) {
  if (!role) return ''
  const key = `owner.roles.${role}` as const
  const translated = t(key)
  return translated === key ? role : translated
}

function permissionLabel(permission: OwnerPermission | string) {
  return t(`owner.permissions.${permission}`)
}

function memberPermissions(member: Pick<OwnerStaffMember, 'role' | 'permissionsJson'>) {
  if (member.role === 'OWNER') return [...ALL_OWNER_PERMISSIONS, 'finance' as OwnerPermission]
  return parsePermissions(member.permissionsJson)
}

function isPermissionChecked(member: Pick<OwnerStaffMember, 'role' | 'permissionsJson'>, permission: OwnerPermission) {
  return memberPermissions(member).includes(permission)
}

function toggleMemberPermission(member: OwnerStaffMember, permission: OwnerPermission) {
  if (member.role === 'OWNER') return
  const current = memberPermissions(member)
  const next = current.includes(permission)
    ? current.filter((item) => item !== permission)
    : [...current, permission]
  if (!staffData.value?.staff) return
  const target = staffData.value.staff.find((item) => item.id === member.id)
  if (target) target.permissionsJson = JSON.stringify(next)
}

async function saveMemberPermissions(member: OwnerStaffMember) {
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
  } catch (err: unknown) {
    staffError.value = fetchErrorMessage(err, t('common.error'))
  } finally {
    staffSaving.value[member.id] = false
  }
}

function toggleInvitePermission(permission: OwnerPermission) {
  if (invitePermissions.value.includes(permission)) {
    invitePermissions.value = invitePermissions.value.filter((item) => item !== permission)
  }
  else {
    invitePermissions.value = [...invitePermissions.value, permission]
  }
}

async function sendStaffInvite() {
  inviting.value = true
  inviteError.value = ''
  inviteResult.value = ''
  try {
    const res = await $fetch<{ phone?: string; created?: boolean }>('/api/owner/staff/invite', {
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
    await refreshStaff()
  }
  catch (err: unknown) {
    inviteError.value = fetchErrorMessage(err, t('common.error'))
  }
  finally {
    inviting.value = false
  }
}

function applyClubData() {
  const club = data.value?.club
  if (!club) return
  form.nameFa = club.nameFa || ''
  form.nameEn = club.nameEn || ''
  form.sloganFa = club.descriptionFa || ''
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
  loadedImage = club.image || null
  form.image = club.image || ''
  form.sheba = club.sheba || ''
  const allowedSlugs = new Set<string>(COURT_FACILITY_OPTIONS.map((item) => item.slug))
  form.amenities = parseFacilitiesJson(club.amenitiesJson)
    .filter((slug) => allowedSlugs.has(slug))
  form.sessionDurations = parseSessionDurationsJson(club.sessionDurationsJson)
  appliedClubId = club.id
  lastAppliedSnapshot = formSnapshot()
}

function formSnapshot() {
  return JSON.stringify({
    nameFa: form.nameFa,
    nameEn: form.nameEn,
    sloganFa: form.sloganFa,
    addressFa: form.addressFa,
    addressEn: form.addressEn,
    city: form.city,
    district: form.district,
    openHour: form.openHour,
    closeHour: form.closeHour,
    cancellationWindowHours: form.cancellationWindowHours,
    rescheduleWindowHours: form.rescheduleWindowHours,
    waitlistEnabled: form.waitlistEnabled,
    phone: form.phone,
    whatsapp: form.whatsapp,
    image: form.image,
    sheba: form.sheba,
    amenities: [...form.amenities],
    sessionDurations: [...form.sessionDurations],
  })
}

let appliedClubId: string | null = null
let lastAppliedSnapshot = ''
/** Cover URL as loaded from the server; omit from PATCH when unchanged. */
let loadedImage: string | null = null

function isFormDirty() {
  return Boolean(lastAppliedSnapshot) && formSnapshot() !== lastAppliedSnapshot
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
}

async function saveCourt(body: Record<string, unknown>) {
  courtSaving.value = true
  courtError.value = ''
  try {
    if (bulkEditCourts.value) {
      await $fetch('/api/owner/courts/bulk', { method: 'PATCH', body })
    } else if (editingCourtId.value) {
      await $fetch(`/api/owner/courts/${editingCourtId.value}`, { method: 'PATCH', body })
    } else {
      await $fetch('/api/owner/courts', { method: 'POST', body })
    }
    editingCourtId.value = null
    bulkEditCourts.value = false
    showCourtForm.value = false
    await refreshCourts()
    await refresh()
  } catch (err: unknown) {
    courtError.value = fetchErrorMessage(err, t('common.error'))
  } finally {
    courtSaving.value = false
  }
}

function requestDeleteCourt(id: string) {
  deleteCourtId.value = id
}

function closeDeleteCourt() {
  if (deletePending.value) return
  deleteCourtId.value = null
}

async function confirmDeleteCourt() {
  if (!deleteCourtId.value) return
  deletePending.value = true
  courtSaving.value = true
  courtError.value = ''
  try {
    await $fetch(`/api/owner/courts/${deleteCourtId.value}`, { method: 'DELETE' })
    if (editingCourtId.value === deleteCourtId.value) {
      editingCourtId.value = null
      showCourtForm.value = false
    }
    deleteCourtId.value = null
    await refreshCourts()
    await refresh()
  } catch (err: unknown) {
    courtError.value = fetchErrorMessage(err, t('common.error'))
    deleteCourtId.value = null
  } finally {
    deletePending.value = false
    courtSaving.value = false
  }
}

function startEditCourt(court: OwnerCourtListItem) {
  bulkEditCourts.value = false
  editingCourtId.value = court.id
  showCourtForm.value = true
}

function startCreateCourt() {
  bulkEditCourts.value = false
  editingCourtId.value = null
  showCourtForm.value = true
}

function startBulkEditCourts() {
  bulkEditCourts.value = true
  editingCourtId.value = null
  showCourtForm.value = true
}

function closeCourtForm() {
  if (courtSaving.value) return
  showCourtForm.value = false
  editingCourtId.value = null
  bulkEditCourts.value = false
}

const galleryUrls = computed(() =>
  (data.value?.club?.media || []).map((item) => item.url).slice(0, 4),
)
async function setGalleryUrls(urls: string[]) {
  const current = data.value?.club?.media || []
  const next = urls.filter(Boolean).slice(0, 4)
  const toRemove = current.filter((item) => !next.includes(item.url))
  for (const item of toRemove) {
    await $fetch(`/api/owner/media/${item.id}`, { method: 'DELETE' })
  }
  const existingUrls = new Set(current.map((item) => item.url))
  for (const url of next) {
    if (!existingUrls.has(url)) {
      await $fetch('/api/owner/media', { method: 'POST', body: { url } })
    }
  }
  await refresh()
}

watch(data, () => {
  const clubId = data.value?.club?.id || null
  if (clubId && appliedClubId && clubId !== appliedClubId) {
    applyClubData()
    return
  }
  if (isFormDirty()) return
  applyClubData()
}, { immediate: true })

async function save() {
  saving.value = true
  saveError.value = ''
  shebaError.value = ''
  imageError.value = ''
  saveSuccess.value = false
  try {
    if (form.sheba.trim() && !isValidSheba(form.sheba)) {
      shebaError.value = t('athlete.shebaInvalid')
      saveError.value = t('athlete.shebaInvalid')
      return
    }
    const body: Record<string, unknown> = {
      nameFa: form.nameFa,
      nameEn: form.nameEn,
      descriptionFa: form.sloganFa || null,
      addressFa: form.addressFa,
      addressEn: form.addressEn || form.addressFa,
      city: form.city,
      district: form.district || null,
      openHour: Number(form.openHour),
      closeHour: Number(form.closeHour),
      cancellationWindowHours: Number(form.cancellationWindowHours),
      rescheduleWindowHours: Number(form.rescheduleWindowHours),
      waitlistEnabled: form.waitlistEnabled,
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      sheba: form.sheba || null,
      amenitiesJson: JSON.stringify(form.amenities),
      sessionDurationsJson: JSON.stringify(form.sessionDurations),
      // Calendar grid uses this DB field; keep it synced to the shortest allowed duration.
      defaultSessionDurationMinutes: form.sessionDurations[0] || 60,
    }
    const nextImage = form.image.trim() || null
    if (nextImage !== loadedImage) body.image = nextImage
    await $fetch('/api/owner/settings', { method: 'PATCH', body })
    saveSuccess.value = true
    lastAppliedSnapshot = formSnapshot()
    await refresh()
  } catch (err: unknown) {
    const message = fetchErrorMessage(err, t('common.error'))
    saveError.value = message
    if (message === t('athlete.shebaInvalid')) shebaError.value = message
    if (message === t('owner.settingsPage.errors.imageInvalid')) imageError.value = message
  } finally {
    saving.value = false
  }
}

function courtHoursLabel(court: Pick<OwnerCourtListItem, 'openHour' | 'closeHour'>) {
  const open = court.openHour ?? form.openHour
  const close = court.closeHour ?? form.closeHour
  return `${String(open).padStart(2, '0')}:00 تا ${String(close).padStart(2, '0')}:00`
}

const editingCourt = computed(() => {
  if (!editingCourtId.value) return null
  return (courtsData.value || []).find((c) => c.id === editingCourtId.value) || null
})

const bulkEditSeedCourt = computed(() => {
  const courts = courtsData.value || []
  if (!courts.length) return null
  return courts[0]!
})

const courtFormCourt = computed(() => {
  if (bulkEditCourts.value) return bulkEditSeedCourt.value
  return editingCourt.value
})

const courtFormTitle = computed(() => {
  if (bulkEditCourts.value) return t('owner.settingsPage.bulkEditCourtsTitle')
  return t('owner.settingsPage.courtDetailsTitle')
})

const hourOptions = computed(() => Array.from({ length: 25 }, (_, i) => i))
</script>

<template>
  <div class="venus-page-stack">
    <header class="canva-home-chrome hidden max-[430px]:flex">
      <NuxtLink :to="localePath('/')" class="flex min-w-0 items-center gap-2" :aria-label="t('brand.name')">
        <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 shrink-0" />
        <InboxWordmark class="text-lg text-brand-primary" />
      </NuxtLink>
    </header>
    <section class="canva-dash-hero hidden max-[430px]:block">
      <p class="text-xs text-white/80">{{ t('owner.dashboardEyebrow') }}</p>
      <h1 class="canva-page-hero-title text-white">{{ t('owner.settings') }}</h1>
    </section>
    <h1 class="hidden text-start text-2xl font-bold text-brand-navy min-[431px]:block">{{ t('owner.settings') }}</h1>

    <div class="mb-4 min-h-[2.75rem]">
      <RoleDashboardSwitcher current="CLUB_ADMIN" />
    </div>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <form class="canva-settings-wide" @submit.prevent="save">
        <!-- مجموعه -->
        <div class="canva-panel space-y-3">
          <h2 class="font-bold text-brand-navy">{{ t('owner.settingsPage.clubGroup') }}</h2>
          <div class="grid grid-cols-2 gap-2">
            <label class="block text-sm">
              <span class="mb-1 block font-bold">{{ t('owner.settingsPage.nameFa') }}</span>
              <input v-model="form.nameFa" required class="neo-input">
            </label>
            <label class="block text-sm">
              <span class="mb-1 block font-bold">{{ t('owner.settingsPage.nameEn') }}</span>
              <input v-model="form.nameEn" required dir="ltr" class="neo-input">
            </label>
          </div>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.slogan') }}</span>
            <input v-model="form.sloganFa" class="neo-input" :placeholder="t('owner.settingsPage.sloganPlaceholder')">
          </label>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.role') }}</span>
            <input :value="staffRoleLabel(data?.membership?.role)" readonly class="neo-input bg-brand-lavender/40">
          </label>
        </div>

        <!-- نشانی -->
        <div class="canva-panel space-y-3">
          <h2 class="font-bold text-brand-navy">{{ t('owner.settingsPage.addressGroup') }}</h2>
          <div class="grid grid-cols-2 gap-2">
            <label class="block text-sm">
              <span class="mb-1 block font-bold">{{ t('owner.settingsPage.city') }}</span>
              <input v-model="form.city" required class="neo-input">
            </label>
            <label class="block text-sm">
              <span class="mb-1 block font-bold">{{ t('owner.settingsPage.district') }}</span>
              <input v-model="form.district" class="neo-input">
            </label>
          </div>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.addressExact') }}</span>
            <input v-model="form.addressFa" required class="neo-input">
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block text-sm">
              <span class="mb-1 block font-bold">{{ t('common.mobile') }}</span>
              <input v-model="form.phone" dir="ltr" class="neo-input tabular-nums">
            </label>
            <label class="block text-sm">
              <span class="mb-1 block font-bold">{{ t('common.whatsapp') }}</span>
              <input v-model="form.whatsapp" dir="ltr" class="neo-input tabular-nums">
            </label>
          </div>
          <label class="block text-sm text-start">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.sheba') }}</span>
            <input
              v-model="form.sheba"
              dir="ltr"
              class="neo-input tabular-nums"
              :class="shebaError ? 'border-red-500' : ''"
              :placeholder="t('owner.financePage.shebaPlaceholder')"
              autocomplete="off"
              :aria-invalid="Boolean(shebaError)"
              aria-describedby="owner-settings-sheba-hint"
            >
            <span id="owner-settings-sheba-hint" class="mt-1 block text-xs text-brand-gray-600">{{ t('owner.settingsPage.shebaHint') }}</span>
            <span v-if="shebaError" class="mt-1 block text-xs font-bold text-red-600" role="alert">{{ shebaError }}</span>
            <span class="mt-1 block text-xs font-bold text-red-600" role="note">{{ t('owner.settingsPage.shebaOwnerOnlyNotice') }}</span>
          </label>
        </div>

        <!-- مدت سانس‌ها -->
        <div class="canva-panel space-y-3">
          <div>
            <h2 class="font-bold text-brand-navy">{{ t('owner.settingsPage.sessionDurations') }}</h2>
            <p class="mt-1 text-sm text-brand-gray-600">{{ t('owner.settingsPage.sessionDurationsHint') }}</p>
          </div>
          <div class="canva-clubs-chip-row flex-wrap">
            <button
              v-for="minutes in DEFAULT_SESSION_DURATIONS"
              :key="`dur-${minutes}`"
              type="button"
              class="canva-chip canva-settings-chip"
              :class="form.sessionDurations.includes(minutes) ? 'canva-settings-chip-active' : 'canva-settings-chip-idle'"
              @click="toggleSessionDuration(minutes)"
            >
              {{ formatNumber(minutes) }} {{ t('owner.settingsPage.minutes') }}
            </button>
          </div>
        </div>

        <!-- امکانات -->
        <div class="canva-panel space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-bold text-brand-navy">{{ t('owner.settingsPage.amenities') }}</h2>
          </div>
          <div class="canva-clubs-chip-row flex-wrap">
            <button
              v-for="facility in COURT_FACILITY_OPTIONS"
              :key="facility.slug"
              type="button"
              class="canva-chip canva-settings-chip"
              :class="form.amenities.includes(facility.slug) ? 'canva-settings-chip-active' : 'canva-settings-chip-idle'"
              @click="toggleAmenity(facility.slug)"
            >
              {{ localizedField(facility, 'nameFa', 'nameEn') }}
            </button>
          </div>
        </div>

        <!-- زمین‌ها -->
        <div class="canva-panel space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-bold text-brand-navy">{{ t('owner.settingsPage.courtsSection') }}</h2>
            <div class="flex flex-wrap items-center justify-end gap-3">
              <button
                v-if="(courtsData || []).length > 1"
                type="button"
                class="canva-owner-add-link"
                @click="startBulkEditCourts"
              >
                {{ t('owner.settingsPage.bulkEditCourts') }}
              </button>
              <button type="button" class="canva-owner-add-link" @click="startCreateCourt">
                + {{ t('owner.settingsPage.addCourt') }}
              </button>
            </div>
          </div>
          <p v-if="courtError" class="text-sm text-red-600">{{ courtError }}</p>
          <ul class="space-y-2">
            <li
              v-for="court in courtsData || []"
              :key="court.id"
              class="canva-settings-court-row"
            >
              <div class="min-w-0 flex-1 text-start">
                <p class="text-sm font-bold text-brand-navy">
                  {{ formatFaDigits(localizedField(court, 'nameFa', 'nameEn')) }}
                  <span class="ms-2 font-medium text-brand-gray-600">{{ localizedField(court.sport, 'nameFa', 'nameEn') }}</span>
                </p>
                <p class="text-xs text-brand-gray-600">
                  {{ courtHoursLabel(court) }}
                  · {{ formatCurrency(court.price) }}
                </p>
              </div>
              <button type="button" class="canva-settings-edit-btn" @click="startEditCourt(court)">
                {{ t('common.edit') }}
              </button>
            </li>
            <li v-if="!(courtsData || []).length" class="text-sm text-brand-gray-600">{{ t('common.empty') }}</li>
          </ul>
        </div>

        <!-- ساعات + لغو -->
        <div class="canva-panel space-y-3">
          <h2 class="font-bold text-brand-navy">{{ t('owner.settingsPage.clubHours') }}</h2>
          <div class="grid grid-cols-2 gap-2">
            <label class="block text-sm">
              <span class="mb-1 block font-bold">{{ t('owner.settingsPage.openHour') }}</span>
              <select v-model.number="form.openHour" class="neo-select">
                <option v-for="h in hourOptions.filter((x) => x < 24)" :key="`o-${h}`" :value="h">
                  {{ String(h).padStart(2, '0') }}:00
                </option>
              </select>
            </label>
            <label class="block text-sm">
              <span class="mb-1 block font-bold">{{ t('owner.settingsPage.closeHour') }}</span>
              <select v-model.number="form.closeHour" class="neo-select">
                <option v-for="h in hourOptions.filter((x) => x > 0)" :key="`c-${h}`" :value="h">
                  {{ String(h).padStart(2, '0') }}:00
                </option>
              </select>
            </label>
          </div>

          <div>
            <h3 class="text-sm font-bold text-brand-navy">{{ t('owner.settingsPage.cancelReschedulePolicy') }}</h3>
            <div class="mt-2 flex flex-wrap gap-3" role="radiogroup" :aria-label="t('owner.settingsPage.cancelReschedulePolicy')">
              <label
                v-for="hours in CANCEL_POLICY_OPTIONS"
                :key="hours"
                class="canva-settings-radio"
              >
                <input
                  v-model="cancelPolicyHours"
                  type="radio"
                  class="sr-only"
                  :value="hours"
                >
                <span
                  class="canva-settings-radio-box"
                  :class="cancelPolicyHours === hours ? 'canva-settings-radio-box-on' : ''"
                  aria-hidden="true"
                />
                <span class="text-sm font-medium text-brand-navy">{{ cancelPolicyLabel(hours) }}</span>
              </label>
            </div>
          </div>

          <label class="canva-settings-check">
            <input v-model="form.waitlistEnabled" type="checkbox" class="canva-settings-checkbox">
            <span class="font-bold">{{ t('owner.settingsPage.waitlist') }}</span>
          </label>
        </div>

        <!-- عکس مجموعه -->
        <div class="canva-panel space-y-3">
          <h2 class="font-bold text-brand-navy">{{ t('owner.settingsPage.clubPhotos') }}</h2>
          <OwnerPhotoSlots
            :model-value="galleryUrls"
            :max="4"
            @update:model-value="setGalleryUrls"
          />
          <AppImageUpload v-model="form.image" :label="t('owner.settingsPage.imageUrl')" placeholder="/placeholders/club.svg" />
          <p v-if="imageError" class="text-sm text-red-600" role="alert">{{ imageError }}</p>
        </div>

        <div v-if="isOwner" class="canva-panel canva-settings-span space-y-3">
          <h2 class="font-bold text-brand-navy">{{ t('owner.settingsPage.workersSection') }}</h2>
          <OwnerWorkersPanel embedded />
        </div>

        <div v-if="isOwner" class="canva-panel canva-settings-span space-y-3">
          <h2 class="font-bold text-brand-navy">{{ t('owner.settingsPage.staffAccess') }}</h2>
          <p class="text-sm text-brand-gray-600">{{ t('owner.settingsPage.staffAccessHint') }}</p>

          <div class="space-y-3 rounded border border-brand-gray-100 bg-brand-lavender/20 p-3">
            <h3 class="text-sm font-bold text-brand-navy">{{ t('owner.inviteStaff') }}</h3>
            <AppFormField :label="t('common.mobile')" required>
              <input
                v-model="invitePhone"
                type="tel"
                inputmode="numeric"
                dir="ltr"
                class="neo-input"
                autocomplete="tel"
                :placeholder="t('auth.phonePlaceholder')"
              >
            </AppFormField>
            <AppFormField :label="t('auth.name')" required>
              <input v-model="inviteName" class="neo-input" autocomplete="name">
            </AppFormField>
            <AppFormField :label="t('owner.settingsPage.role')">
              <select v-model="inviteRole" class="neo-select">
                <option value="FRONT_DESK">{{ t('owner.roles.FRONT_DESK') }}</option>
                <option value="MANAGER">{{ t('owner.roles.MANAGER') }}</option>
                <option value="ANALYST">{{ t('owner.roles.ANALYST') }}</option>
              </select>
            </AppFormField>
            <div class="ios-card bg-white/70 p-3">
              <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.permissionsTitle') }}</p>
              <div class="grid gap-2 sm:grid-cols-2">
                <label v-for="permission in ALL_OWNER_PERMISSIONS" :key="`invite-${permission}`" class="flex items-center gap-2 text-sm">
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
            <p v-if="inviteResult" class="text-sm text-green-700">{{ inviteResult }}</p>
            <button
              type="button"
              class="canva-settings-edit-btn w-full"
              :disabled="inviting || !invitePhone.trim() || !inviteName.trim()"
              @click="sendStaffInvite"
            >
              {{ inviting ? t('common.loading') : t('owner.sendInvite') }}
            </button>
          </div>

          <p v-if="staffError" class="text-sm text-red-600">{{ staffError }}</p>
          <p v-if="staffSuccess" class="text-sm text-green-700">{{ staffSuccess }}</p>
          <ul class="space-y-3">
            <li v-for="member in staffMembers" :key="member.id" class="canva-settings-staff-card">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="font-bold">{{ (!pilotNoCoach && member.coach) ? localizedField(member.coach, 'nameFa', 'nameEn') : member.user.name }}</p>
                  <p class="text-xs text-brand-gray-600">
                    <span class="canva-chip canva-settings-chip-idle px-2 py-0.5">{{ staffRoleLabel(member.role) }}</span>
                    <span class="ms-2"><bdi dir="ltr" class="tabular-nums">{{ member.user.phone ? formatPhone(member.user.phone) : member.user.email }}</bdi></span>
                  </p>
                </div>
                <button
                  v-if="member.role !== 'OWNER'"
                  type="button"
                  class="canva-settings-edit-btn"
                  :disabled="staffSaving[member.id]"
                  @click="saveMemberPermissions(member)"
                >
                  {{ staffSaving[member.id] ? t('common.loading') : t('common.save') }}
                </button>
              </div>
              <fieldset
                class="mt-3 min-w-0 border-0 p-0 m-0"
                :disabled="member.role === 'OWNER'"
                :aria-disabled="member.role === 'OWNER' ? 'true' : undefined"
              >
                <legend class="sr-only">{{ t('owner.settingsPage.staffAccess') }}</legend>
                <div class="grid gap-2 sm:grid-cols-2">
                  <label
                    v-for="permission in BASE_OWNER_PERMISSIONS"
                    :key="`${member.id}-${permission}`"
                    class="canva-settings-check text-sm"
                    :class="member.role === 'OWNER' ? 'pointer-events-none cursor-not-allowed opacity-70' : ''"
                  >
                    <input
                      type="checkbox"
                      class="canva-settings-checkbox"
                      :checked="isPermissionChecked(member, permission)"
                      :disabled="member.role === 'OWNER'"
                      :tabindex="member.role === 'OWNER' ? -1 : undefined"
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
                      class="canva-settings-check text-sm"
                      :class="member.role === 'OWNER' ? 'pointer-events-none cursor-not-allowed opacity-70' : ''"
                    >
                      <input
                        type="checkbox"
                        class="canva-settings-checkbox"
                        :checked="isPermissionChecked(member, permission)"
                        :disabled="member.role === 'OWNER'"
                        :tabindex="member.role === 'OWNER' ? -1 : undefined"
                        @change="toggleMemberPermission(member, permission)"
                      >
                      <span>{{ permissionLabel(permission) }}</span>
                    </label>
                  </div>
                </div>
              </fieldset>
              <p v-if="member.role === 'OWNER'" class="mt-2 text-xs text-brand-gray-500">{{ t('owner.settingsPage.ownerPermissionsReadonly') }}</p>
            </li>
            <li v-if="!(staffData?.staff || []).length" class="text-sm text-brand-gray-600">{{ t('common.empty') }}</li>
          </ul>
        </div>

        <div class="canva-settings-span">
          <p class="mb-2 text-xs text-brand-gray-600">{{ t('owner.settingsPage.saveChangesHint') }}</p>
          <p v-if="saveError" class="mb-2 text-sm text-red-600">{{ saveError }}</p>
          <p v-if="saveSuccess" class="mb-2 text-sm text-green-700">{{ t('common.saved') }}</p>
          <button type="submit" class="canva-owner-save-cta" :disabled="saving">
            {{ saving ? t('common.loading') : t('owner.settingsPage.saveChanges') }}
          </button>
        </div>
      </form>
    </AppAsyncState>

    <AppModal
      :open="showCourtForm"
      :title="courtFormTitle"
      sheet
      patterned
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeCourtForm"
    >
      <div class="canva-auth-body px-5 pb-6 pt-2">
        <OwnerCourtForm
          :court="courtFormCourt"
          :club-open-hour="form.openHour"
          :club-close-hour="form.closeHour"
          :saving="courtSaving"
          :bulk-edit="bulkEditCourts"
          :bulk-count="(courtsData || []).length"
          @save="saveCourt"
          @cancel="closeCourtForm"
          @delete="requestDeleteCourt"
        />
      </div>
    </AppModal>

    <CanvaConfirmSheet
      :open="Boolean(deleteCourtId)"
      :title="t('owner.settingsPage.confirmDeleteCourt')"
      :body="t('owner.settingsPage.confirmDeleteCourt')"
      :confirm-label="t('booking.confirmYes')"
      :dismiss-label="t('booking.confirmNo')"
      :pending="deletePending"
      danger
      @confirm="confirmDeleteCourt"
      @close="closeDeleteCourt"
    />

    <OwnerLegalFooter />
  </div>
</template>
