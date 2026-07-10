<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatHours } = useFormatters()
const { data, refresh } = await useAuthedFetch('/api/owner/settings')
useOwnerClubRefresh(refresh)

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

    <form class="grid gap-4 md:grid-cols-2" @submit.prevent="save">
      <div class="rounded-2xl border border-black/5 bg-white p-6 md:col-span-2">
        <h2 class="font-bold">{{ t('owner.settingsPage.clubProfile') }}</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.nameFa') }}</span>
            <input v-model="form.nameFa" required class="w-full rounded-xl border px-3 py-2">
          </label>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.nameEn') }}</span>
            <input v-model="form.nameEn" required dir="ltr" class="w-full rounded-xl border px-3 py-2">
          </label>
          <label class="block text-sm sm:col-span-2">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.slug') }}</span>
            <input :value="data?.club?.slug" readonly dir="ltr" class="w-full rounded-xl border bg-brand-cream/40 px-3 py-2 tabular-nums">
          </label>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.role') }}</span>
            <input :value="staffRoleLabel(data?.membership?.role)" readonly class="w-full rounded-xl border bg-brand-cream/40 px-3 py-2">
          </label>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.city') }}</span>
            <input v-model="form.city" required class="w-full rounded-xl border px-3 py-2">
          </label>
          <label class="block text-sm">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.district') }}</span>
            <input v-model="form.district" class="w-full rounded-xl border px-3 py-2">
          </label>
          <label class="block text-sm sm:col-span-2">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.addressFa') }}</span>
            <input v-model="form.addressFa" required class="w-full rounded-xl border px-3 py-2">
          </label>
          <label class="block text-sm sm:col-span-2">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.addressEn') }}</span>
            <input v-model="form.addressEn" required dir="ltr" class="w-full rounded-xl border px-3 py-2">
          </label>
        </div>
      </div>

      <div class="rounded-2xl border border-black/5 bg-white p-6">
        <h2 class="font-bold">{{ t('owner.settingsPage.operations') }}</h2>
        <div class="mt-3 space-y-3 text-sm">
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="mb-1 block font-bold">{{ t('owner.settingsPage.openHour') }}</span>
              <input v-model.number="form.openHour" type="number" min="0" max="23" required dir="ltr" class="w-full rounded-xl border px-3 py-2 tabular-nums">
            </label>
            <label class="block">
              <span class="mb-1 block font-bold">{{ t('owner.settingsPage.closeHour') }}</span>
              <input v-model.number="form.closeHour" type="number" min="1" max="24" required dir="ltr" class="w-full rounded-xl border px-3 py-2 tabular-nums">
            </label>
          </div>
          <label class="block">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.cancellation') }}</span>
            <input v-model.number="form.cancellationWindowHours" type="number" min="0" required dir="ltr" class="w-full rounded-xl border px-3 py-2 tabular-nums">
            <span class="mt-1 block text-xs text-brand-gray-600">{{ formatHours(form.cancellationWindowHours) }}</span>
          </label>
          <label class="block">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.reschedule') }}</span>
            <input v-model.number="form.rescheduleWindowHours" type="number" min="0" required dir="ltr" class="w-full rounded-xl border px-3 py-2 tabular-nums">
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

      <div class="rounded-2xl border border-black/5 bg-white p-6">
        <h2 class="font-bold">{{ t('owner.settingsPage.contacts') }}</h2>
        <div class="mt-3 space-y-3 text-sm">
          <label class="block">
            <span class="mb-1 block font-bold">{{ t('common.mobile') }}</span>
            <input v-model="form.phone" dir="ltr" class="w-full rounded-xl border px-3 py-2 tabular-nums">
          </label>
          <label class="block">
            <span class="mb-1 block font-bold">{{ t('common.whatsapp') }}</span>
            <input v-model="form.whatsapp" dir="ltr" class="w-full rounded-xl border px-3 py-2 tabular-nums">
          </label>
        </div>
      </div>

      <div class="md:col-span-2">
        <p v-if="saveError" class="mb-2 text-sm text-red-600">{{ saveError }}</p>
        <p v-if="saveSuccess" class="mb-2 text-sm text-green-700">{{ t('common.saved') }}</p>
        <button type="submit" class="btn-primary w-full sm:w-auto" :disabled="saving">
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </form>
  </div>
</template>
