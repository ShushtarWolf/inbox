<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' , ssr: false})

const { t } = useI18n()
const { user, fetch, displayName, avatarUrl: authAvatar, initials } = useAuth()
const { fetchErrorMessage } = useFetchError()
const { formatCurrency } = useFormatters()
const { data: wallet, pending: walletPending } = useAuthedFetch<{ balance?: number }>('/api/wallet')
const { multiReady } = useSmsCapability()
const name = ref('')
const phone = ref('')
const avatarUrl = ref('')
const saving = ref(false)
const savingAvatar = ref(false)
const saved = ref(false)
const saveError = ref('')
const showHeroPhoto = ref(true)

const addMobileHint = computed(() =>
  multiReady.value ? t('athlete.addMobileForSmsMulti') : t('athlete.addMobileForSmsSingle'),
)

const heroPhoto = computed(() => avatarUrl.value || authAvatar.value || '')

watch(heroPhoto, (url) => {
  showHeroPhoto.value = Boolean(url)
})

function normalizeAvatar(url: string) {
  return url.replace(/^\/uploads\/uploads\//, '/uploads/')
}

onMounted(async () => {
  await fetch()
  name.value = user.value?.name || ''
  phone.value = user.value?.phone || ''
  const stored = normalizeAvatar(user.value?.avatarUrl || '')
  if (!avatarUrl.value) {
    avatarUrl.value = stored
  } else if (normalizeAvatar(avatarUrl.value) !== stored) {
    await persistAvatar(normalizeAvatar(avatarUrl.value))
  }
})

async function persistAvatar(url: string) {
  savingAvatar.value = true
  saveError.value = ''
  saved.value = false
  const normalized = url ? normalizeAvatar(url) : ''
  try {
    await $fetch('/api/profile', {
      method: 'PATCH',
      body: { avatarUrl: normalized || null },
    })
    await fetch()
    avatarUrl.value = normalizeAvatar(user.value?.avatarUrl || normalized)
    // Only show success when the browser can actually paint the image
    if (normalized && import.meta.client) {
      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('load'))
        img.src = normalized
      })
    }
    showHeroPhoto.value = Boolean(avatarUrl.value)
    saved.value = true
  } catch (err) {
    saved.value = false
    showHeroPhoto.value = false
    saveError.value = err instanceof Error && err.message === 'load'
      ? t('upload.errorLoad')
      : fetchErrorMessage(err, t('common.error'))
  } finally {
    savingAvatar.value = false
  }
}

async function onAvatarChange(url: string) {
  if (!url) {
    avatarUrl.value = ''
    await persistAvatar('')
    return
  }
  avatarUrl.value = normalizeAvatar(url)
  await persistAvatar(avatarUrl.value)
}

async function save() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  try {
    await $fetch('/api/profile', {
      method: 'PATCH',
      body: { name: name.value, phone: phone.value, avatarUrl: avatarUrl.value || null },
    })
    await fetch()
    saved.value = true
  } catch (err) {
    saveError.value = fetchErrorMessage(err, t('common.error'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/athlete" :title="t('nav.profile')" />
    <section class="canva-dash-hero">
      <div class="flex items-center gap-4">
        <!-- Canva hub uses circular avatar -->
        <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-white/15 text-lg font-bold">
          <img
            v-if="heroPhoto && showHeroPhoto"
            :src="heroPhoto"
            alt=""
            class="h-full w-full object-cover"
            @error="showHeroPhoto = false"
          />
          <span v-else>{{ initials }}</span>
        </div>
        <div class="min-w-0 text-start">
          <p class="text-xs text-white/80">{{ t('nav.profile') }}</p>
          <h1 class="truncate text-xl font-bold text-white">{{ displayName }}</h1>
        </div>
      </div>
      <p class="mt-3 text-start text-xs text-white/80">{{ t('booking.walletBalance') }}</p>
      <p class="text-start text-lg font-bold tabular-nums text-white">
        <span dir="ltr">{{ walletPending ? '…' : formatCurrency(wallet?.balance || 0) }}</span>
      </p>
    </section>

    <div class="canva-panel space-y-3">
      <AppImageUpload :model-value="avatarUrl" :label="t('register.profilePhoto')" @update:model-value="onAvatarChange" />
      <p v-if="savingAvatar" class="text-xs text-brand-gray-600">{{ t('upload.uploading') }}</p>
      <AppFormField :label="t('common.name')">
        <input v-model="name" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('common.mobile')" numeric>
        <input v-model="phone" dir="ltr" class="neo-input tabular-nums" />
      </AppFormField>
      <p v-if="!phone.trim()" class="text-sm text-brand-gray-600">{{ addMobileHint }}</p>
      <p v-if="saveError" class="text-sm font-bold text-brand-primary">{{ saveError }}</p>
      <p v-else-if="saved" class="text-sm font-bold text-emerald-700">{{ t('common.saved') }}</p>
      <button type="button" class="canva-black-cta" :disabled="saving || savingAvatar" @click="save">
        {{ saving ? t('common.loading') : t('common.save') }}
      </button>
    </div>
  </div>
</template>
