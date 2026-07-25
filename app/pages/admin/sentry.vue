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
  noteCode?: 'enabled' | 'unset'
  note: string
}

type SentryTestResult = {
  ok: boolean
  sentryEnabled: boolean
  eventId: string | null
  environment?: string
  noteCode?: 'unset_noop' | 'captured'
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
const clientWasNoop = ref(false)

const isUnset = computed(() => status.value !== null && !status.value.sentryEnabled)

function statusNote(s: SentryStatus) {
  if (s.noteCode === 'enabled' || s.sentryEnabled) return t('admin.sentryPage.noteEnabled')
  return t('admin.sentryPage.noteUnset')
}

function serverResultNote(r: SentryTestResult) {
  if (r.noteCode === 'captured' || (r.sentryEnabled && r.eventId)) return t('admin.sentryPage.resultCaptured')
  return t('admin.sentryPage.resultUnsetNoop')
}

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
  clientWasNoop.value = false
  if (isUnset.value || typeof $sentryCaptureTest !== 'function') {
    clientWasNoop.value = true
    clientNote.value = t('admin.sentryPage.clientDisabled')
    return
  }
  const id = $sentryCaptureTest()
  if (!id) {
    clientWasNoop.value = true
    clientNote.value = t('admin.sentryPage.clientDisabled')
    return
  }
  clientEventId.value = id
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
      <button
        type="button"
        class="border border-brand-gray-300 bg-white px-3 py-2 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40 disabled:opacity-60"
        style="border-radius: 2px;"
        :disabled="pending"
        @click="load"
      >
        {{ t('common.retry') }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
      <div v-if="status" class="space-y-6">
        <!-- Honest empty / unset banner -->
        <div
          class="border p-3 text-sm font-bold"
          style="border-radius: 2px;"
          :class="isUnset
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900'"
        >
          <span
            class="me-2 inline-block px-2 py-0.5 text-xs"
            style="border-radius: 2px;"
            :class="isUnset ? 'bg-amber-100' : 'bg-emerald-100'"
          >
            {{ isUnset ? t('admin.sentryPage.badgeUnset') : t('admin.sentryPage.badgeEnabled') }}
          </span>
          {{ isUnset ? t('admin.sentryPage.emptyBanner') : t('admin.sentryPage.enabledBanner') }}
        </div>

        <section
          class="space-y-3 border border-brand-gray-200 bg-white p-4"
          style="border-radius: 2px;"
        >
          <h2 class="tail-section-title">{{ t('admin.sentryPage.statusTitle') }}</h2>
          <p class="text-sm text-brand-gray-600">{{ statusNote(status) }}</p>
          <ul class="space-y-2 text-sm">
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.sentryPage.enabled') }}</span>
              <strong dir="ltr">{{ yesNo(status.sentryEnabled) }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.sentryPage.environment') }}</span>
              <strong dir="ltr">{{ status.environment }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.sentryPage.release') }}</span>
              <strong class="font-mono text-xs" dir="ltr">{{ status.release || '—' }}</strong>
            </li>
          </ul>
          <p class="text-xs text-brand-gray-500">{{ t('admin.sentryPage.dsnNeverShown') }}</p>
        </section>

        <section
          class="space-y-3 border border-brand-gray-200 bg-white p-4"
          style="border-radius: 2px;"
        >
          <h2 class="tail-section-title">{{ t('admin.sentryPage.testTitle') }}</h2>
          <p class="text-sm text-brand-gray-600">
            {{ isUnset ? t('admin.sentryPage.testHintUnset') : t('admin.sentryPage.testHint') }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="bg-brand-primary px-4 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-brand-gray-300 disabled:text-brand-gray-600"
              style="border-radius: 2px;"
              :disabled="serverBusy"
              @click="triggerServer"
            >
              {{ serverBusy ? t('admin.sentryPage.sending') : t('admin.sentryPage.triggerServer') }}
            </button>
            <button
              type="button"
              class="border border-brand-gray-300 bg-white px-4 py-2 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40"
              style="border-radius: 2px;"
              @click="triggerClient"
            >
              {{ t('admin.sentryPage.triggerClient') }}
            </button>
          </div>
          <p v-if="serverError" class="venus-alert-error text-start" role="alert">{{ serverError }}</p>
          <div
            v-if="serverResult"
            class="border p-3 text-sm"
            style="border-radius: 2px;"
            :class="serverResult.sentryEnabled && serverResult.eventId
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'"
            role="status"
          >
            <p>{{ serverResultNote(serverResult) }}</p>
            <p v-if="serverResult.eventId" class="mt-1 font-mono text-xs" dir="ltr">{{ serverResult.eventId }}</p>
          </div>
          <div
            v-if="clientNote"
            class="border p-3 text-sm"
            style="border-radius: 2px;"
            :class="clientWasNoop
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'"
            role="status"
          >
            <p>{{ clientNote }}</p>
            <p v-if="clientEventId" class="mt-1 font-mono text-xs" dir="ltr">{{ clientEventId }}</p>
          </div>
        </section>
      </div>
    </AppAsyncState>
  </div>
</template>
