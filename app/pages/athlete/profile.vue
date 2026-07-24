<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' , ssr: false})

const { t } = useI18n()
const { user, fetch, displayName, avatarUrl: authAvatar, initials } = useAuth()
const name = ref('')
const phone = ref('')
const avatarUrl = ref('')
const saving = ref(false)
const saved = ref(false)

onMounted(async () => {
  await fetch()
  name.value = user.value?.name || ''
  phone.value = user.value?.phone || ''
  avatarUrl.value = user.value?.avatarUrl || ''
})

async function save() {
  saving.value = true
  saved.value = false
  try {
    await $fetch('/api/profile', {
      method: 'PATCH',
      body: { name: name.value, phone: phone.value, avatarUrl: avatarUrl.value || null },
    })
    await fetch()
    saved.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-dash-hero">
      <div class="flex items-center gap-4">
        <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-white/15 text-lg font-bold">
          <img v-if="avatarUrl || authAvatar" :src="avatarUrl || authAvatar || ''" alt="" class="h-full w-full object-cover" />
          <span v-else>{{ initials }}</span>
        </div>
        <div class="min-w-0">
          <p class="text-xs text-white/80">{{ t('nav.profile') }}</p>
          <h1 class="truncate text-xl font-bold">{{ displayName }}</h1>
        </div>
      </div>
    </section>

    <div class="space-y-3 rounded-xl border border-brand-gray-200 bg-white p-4 shadow-venus-sm">
      <AppImageUpload v-model="avatarUrl" :label="t('register.profilePhoto')" />
      <AppFormField :label="t('common.name')">
        <input v-model="name" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('common.mobile')">
        <input v-model="phone" dir="ltr" class="neo-input tabular-nums" />
      </AppFormField>
      <p v-if="!phone.trim()" class="text-sm text-brand-gray-600">{{ t('athlete.addMobileForSms') }}</p>
      <p v-if="saved" class="text-sm font-bold text-emerald-700">{{ t('common.saved') }}</p>
      <button type="button" class="btn-primary w-full" :disabled="saving" @click="save">
        {{ saving ? t('common.loading') : t('common.save') }}
      </button>
    </div>
  </div>
</template>
