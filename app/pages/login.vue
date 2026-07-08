<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { login } = useAuth()

const email = ref('athlete@inbox.local')
const password = ref('demo1234')
const error = ref('')

async function submit() {
  error.value = ''
  let user

  try {
    user = await login(email.value, password.value)
  } catch {
    error.value = t('auth.invalidCredentials')
    return
  }

  const target = user.role === 'CLUB_ADMIN'
    ? localePath('/owner')
    : user.role === 'COACH'
      ? localePath('/coach')
      : localePath('/athlete')
  // #region agent log
  fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'pre-fix',hypothesisId:'C',location:'app/pages/login.vue',message:'login returned role and target',data:{role:user.role,target},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  try {
    await navigateTo(target, { external: true })
  } catch {
    error.value = t('auth.dashboardLoadFailed')
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <h1 class="font-display text-xl font-black">{{ t('auth.login') }}</h1>
    <input v-model="email" type="email" :placeholder="t('auth.email')" class="w-full rounded-xl border px-3 py-2" />
    <input v-model="password" type="password" :placeholder="t('auth.password')" class="w-full rounded-xl border px-3 py-2" />
    <p v-if="error" class="text-sm text-brand-primary">{{ error }}</p>
    <button type="button" class="btn-primary w-full" @click="submit">{{ t('auth.login') }}</button>
    <NuxtLink :to="localePath('/register')" class="block text-center text-sm text-brand-gray-600">{{ t('auth.register') }}</NuxtLink>
  </div>
</template>
