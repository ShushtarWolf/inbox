<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { $sentryCaptureTest } = useNuxtApp()

type SentryStatus = {
  ok: boolean
  sentryEnabled: boolean
  environment: string
  release: string | null
  note: string
}

type SentryTestResult = {
  ok: boolean
  sentryEnabled: boolean
  eventId: string | null
  environment?: string
  note: string
}

const status = ref<SentryStatus | null>(null)
const pending = ref(false)
const loadError = ref('')
const serverResult = ref<SentryTestResult | null>(null)
const serverError = ref('')
const serverBusy = ref(false)
const clientEventId = ref<string | null>(null)
const clientNote = ref('')

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    status.value = await adminFetch<SentryStatus>('/api/admin/sentry-status')
  } catch (err: unknown) {
    const code = (err as { statusCode?: number })?.statusCode
    if (code === 403) {
      loadError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      loadError.value = t('common.error')
    }
  } finally {
    pending.value = false
  }
}

async function triggerServer() {
  if (!secret.value || serverBusy.value) return
  serverBusy.value = true
  serverError.value = ''
  serverResult.value = null
  try {
    serverResult.value = await adminFetch<SentryTestResult>('/api/admin/sentry-test', {
      method: 'POST',
    })
  } catch (err: unknown) {
    const code = (err as { statusCode?: number })?.statusCode
    if (code === 403) {
      serverError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      serverError.value = t('common.error')
    }
  } finally {
    serverBusy.value = false
  }
}

function triggerClient() {
  clientEventId.value = null
  clientNote.value = ''
  if (typeof $sentryCaptureTest !== 'function') {
    clientNote.value = t('admin.sentryPage.clientDisabled')
    return
  }
  const id = $sentryCaptureTest()
  clientEventId.value = id ?? null
  clientNote.value = t('admin.sentryPage.clientSent')
}

function yesNo(value: boolean) {
  return value ? t('admin.sentryPage.yes') : t('admin.sentryPage.no')
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })
</script>

<template>
  <div class="tail-page-stack">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="tail-page-title">{{ t('admin.sentryTitle') }}</h1>
        <p class="mt-1 text-sm text-brand-gray-600">{{ t('admin.sentrySubtitle') }}</p>
      </div>
      <button type="button" class="btn-secondary text-xs" :disabled="pending" @click="load">
        {{ t('common.retry') }}
      </button>
    </div>

    <p v-if="loadError" class="text-sm text-red-600" role="alert">{{ loadError }}</p>

    <section v-if="status" class="space-y-3 text-sm">
      <h2 class="font-medium text-brand-gray-900">{{ t('admin.sentryPage.statusTitle') }}</h2>
      <dl class="grid gap-2 sm:grid-cols-2">
        <div>
          <dt class="text-brand-gray-500">{{ t('admin.sentryPage.enabled') }}</dt>
          <dd>{{ yesNo(status.sentryEnabled) }}</dd>
        </div>
        <div>
          <dt class="text-brand-gray-500">{{ t('admin.sentryPage.environment') }}</dt>
          <dd>{{ status.environment }}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-brand-gray-500">{{ t('admin.sentryPage.release') }}</dt>
          <dd class="font-mono text-xs">{{ status.release || '—' }}</dd>
        </div>
      </dl>
      <p class="text-brand-gray-600">{{ status.note }}</p>
    </section>

    <section class="space-y-3 text-sm">
      <h2 class="font-medium text-brand-gray-900">{{ t('admin.sentryPage.testTitle') }}</h2>
      <p class="text-brand-gray-600">{{ t('admin.sentryPage.testHint') }}</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary text-xs" :disabled="serverBusy" @click="triggerServer">
          {{ serverBusy ? t('admin.sentryPage.sending') : t('admin.sentryPage.triggerServer') }}
        </button>
        <button type="button" class="btn-secondary text-xs" @click="triggerClient">
          {{ t('admin.sentryPage.triggerClient') }}
        </button>
      </div>
      <p v-if="serverError" class="text-red-600" role="alert">{{ serverError }}</p>
      <p v-if="serverResult" class="text-brand-gray-700">
        {{ serverResult.note }}
        <span v-if="serverResult.eventId" class="mt-1 block font-mono text-xs">{{ serverResult.eventId }}</span>
      </p>
      <p v-if="clientNote" class="text-brand-gray-700">
        {{ clientNote }}
        <span v-if="clientEventId" class="mt-1 block font-mono text-xs">{{ clientEventId }}</span>
      </p>
    </section>
  </div>
</template>
