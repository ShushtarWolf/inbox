<script setup lang="ts">
const deferredPrompt = ref<any>(null)
const dismissed = useCookie('inbox_pwa_dismissed', { default: () => '0' })
const canInstall = ref(false)
const route = useRoute()

const shouldShow = computed(() => {
  const path = route.path
  return !path.includes('/owner') && !path.includes('/coach') && !path.includes('/athlete')
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
  <div v-if="canInstall && shouldShow" class="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-brutal border-2 border-black bg-brand-sky p-4 shadow-brutal-lg lg:bottom-6">
    <p class="font-black">{{ $t('pwa.installTitle') }}</p>
    <p class="mt-1 text-sm font-bold text-black/80">{{ $t('pwa.installBody') }}</p>
    <div class="mt-3 flex gap-2">
      <button type="button" class="btn-primary flex-1" @click="install">{{ $t('pwa.installButton') }}</button>
      <button type="button" class="btn-ghost" @click="dismiss">{{ $t('pwa.dismissButton') }}</button>
    </div>
  </div>
</template>
