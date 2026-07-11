<script setup lang="ts">
const deferredPrompt = ref<any>(null)
const dismissed = useCookie('inbox_pwa_dismissed', { default: () => '0' })
const canInstall = ref(false)
const route = useRoute()
const { t } = useI18n()
const config = useRuntimeConfig()

const shouldShow = computed(() => {
  if (!config.public.enablePwa) return false
  const path = route.path
  return !path.includes('/login')
    && !path.includes('/register')
    && !path.includes('/offline')
})

function onBeforeInstallPrompt(event: Event) {
  event.preventDefault()
  deferredPrompt.value = event
  canInstall.value = dismissed.value !== '1'
}

async function install() {
  if (!deferredPrompt.value) return
  await deferredPrompt.value.prompt()
  deferredPrompt.value = null
  canInstall.value = false
}

function dismiss() {
  dismissed.value = '1'
  canInstall.value = false
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
})
</script>

<template>
  <div
    v-if="canInstall && shouldShow"
    class="tail-card fixed inset-x-4 z-50 mx-auto max-w-md shadow-tail-lg"
    style="bottom: calc(var(--sz-tab-bar-height) + var(--sz-safe-bottom) + 1rem)"
  >
    <div class="mb-2 flex items-center gap-3">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="h-10 w-10" />
      <div>
        <p class="font-semibold text-brand-navy">{{ t('pwa.installTitle') }}</p>
        <p class="text-xs text-brand-gray-500">{{ t('pwa.installBody') }}</p>
      </div>
    </div>
    <div class="flex gap-2">
      <button type="button" class="btn-primary flex-1" @click="install">{{ t('pwa.installButton') }}</button>
      <button type="button" class="btn-ghost" @click="dismiss">{{ t('pwa.dismissButton') }}</button>
    </div>
  </div>
</template>
