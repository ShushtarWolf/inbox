<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' , ssr: false})

const { user, fetch } = useAuth()
const name = ref('')
const phone = ref('')
const avatarUrl = ref('')

onMounted(async () => {
  await fetch()
  name.value = user.value?.name || ''
  phone.value = user.value?.phone || ''
  avatarUrl.value = user.value?.avatarUrl || ''
})

async function save() {
  await $fetch('/api/profile', {
    method: 'PATCH',
    body: { name: name.value, phone: phone.value, avatarUrl: avatarUrl.value || null },
  })
  await fetch()
}
</script>

<template>
  <div class="venus-page-stack">
    <PageHeaderNav :title="$t('nav.profile')" :show-actions="false" />
    <AppImageUpload v-model="avatarUrl" :label="$t('register.profilePhoto')" />
    <input v-model="name" :placeholder="$t('common.name')" class="neo-input" />
    <input v-model="phone" dir="ltr" :placeholder="$t('common.mobile')" class="neo-input tabular-nums" />
    <p v-if="!phone.trim()" class="text-sm text-brand-gray-600">{{ $t('athlete.addMobileForSms') }}</p>
    <button type="button" class="btn-primary w-full" @click="save">{{ $t('common.save') }}</button>
  </div>
</template>
