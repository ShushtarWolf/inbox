<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()

const name = ref('')
const email = ref('')
const password = ref('')

function redirectTo(target: string) {
  if (import.meta.client) {
    window.location.assign(target)
    return
  }
  return navigateTo(target)
}

async function submit() {
  const user = await $fetch<{ role: string }>('/api/auth/register', {
    method: 'POST',
    body: { name: name.value, email: email.value, password: password.value, role: 'ATHLETE', locale: locale.value },
  })
  if (user.role === 'CLUB_ADMIN') await redirectTo(localePath('/owner'))
  else if (user.role === 'COACH') await redirectTo(localePath('/coach'))
  else await redirectTo(localePath('/athlete'))
}
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <h1 class="font-display text-xl font-black">{{ t('auth.register') }}</h1>
    <input v-model="name" :placeholder="t('auth.name')" class="w-full rounded-xl border px-3 py-2" />
    <input v-model="email" type="email" :placeholder="t('auth.email')" class="w-full rounded-xl border px-3 py-2" />
    <input v-model="password" type="password" :placeholder="t('auth.password')" class="w-full rounded-xl border px-3 py-2" />
    <button type="button" class="btn-primary w-full" @click="submit">{{ t('auth.register') }}</button>
  </div>
</template>
