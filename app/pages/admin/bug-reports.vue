<script setup lang="ts">
definePageMeta({ layout: false, ssr: false })

useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { t } = useI18n()
const { secret, setSecret, clearSecret, adminFetch } = useAdminSecret()

const secretInput = ref('')
const authError = ref('')
const loadError = ref('')
const pending = ref(false)
const statusFilter = ref<'ALL' | 'OPEN' | 'RESOLVED'>('ALL')

type BugReport = {
  id: string
  description: string
  screenshotUrl: string | null
  pageUrl: string
  userAgent: string | null
  reporterEmail: string | null
  status: 'OPEN' | 'RESOLVED'
  createdAt: string
  resolvedAt: string | null
  user: { id: string; email: string; name: string; nameEn: string | null } | null
}

const reports = ref<BugReport[]>([])
const detailTarget = ref<BugReport | null>(null)
const updatingId = ref<string | null>(null)

const filteredReports = computed(() => {
  if (statusFilter.value === 'ALL') return reports.value
  return reports.value.filter((report) => report.status === statusFilter.value)
})

async function loadReports() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    const query = statusFilter.value !== 'ALL' ? `?status=${statusFilter.value}` : ''
    const data = await adminFetch<{ reports: BugReport[] }>(`/api/admin/bug-reports${query}`)
    reports.value = data.reports
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      loadError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      loadError.value = t('common.error')
    }
  } finally {
    pending.value = false
  }
}

function submitSecret() {
  authError.value = ''
  if (!secretInput.value.trim()) {
    authError.value = t('admin.secretRequired')
    return
  }
  setSecret(secretInput.value)
  loadReports()
}

function openDetail(report: BugReport) {
  detailTarget.value = report
}

function closeDetail() {
  detailTarget.value = null
}

async function toggleStatus(report: BugReport) {
  const nextStatus = report.status === 'OPEN' ? 'RESOLVED' : 'OPEN'
  updatingId.value = report.id
  try {
    await adminFetch(`/api/admin/bug-reports/${report.id}`, {
      method: 'PATCH',
      body: { status: nextStatus },
    })
    await loadReports()
    if (detailTarget.value?.id === report.id) {
      detailTarget.value = reports.value.find((item) => item.id === report.id) || null
    }
  } catch {
    loadError.value = t('common.error')
  } finally {
    updatingId.value = null
  }
}

watch(secret, (value) => {
  if (value) loadReports()
}, { immediate: true })

watch(statusFilter, () => {
  if (secret.value) loadReports()
})
</script>

<template>
  <div class="mx-auto min-h-screen max-w-5xl p-4 pt-8">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="font-display text-xl font-bold">{{ t('bugReport.adminTitle') }}</h1>
      <div class="flex items-center gap-3">
        <NuxtLink to="/admin/applications" class="text-sm font-bold text-brand-navy underline">
          {{ t('admin.title') }}
        </NuxtLink>
        <button v-if="secret" type="button" class="text-sm font-bold text-brand-navy underline" @click="clearSecret">
          {{ t('admin.logout') }}
        </button>
      </div>
    </div>

    <div v-if="!secret" class="ios-card mx-auto max-w-sm p-6 venus-form-stack">
      <p class="text-sm text-brand-gray-600">{{ t('admin.secretPrompt') }}</p>
      <AppFormField :label="t('admin.secretLabel')">
        <input v-model="secretInput" type="password" class="neo-input" dir="ltr" @keyup.enter="submitSecret" />
      </AppFormField>
      <p v-if="authError" class="venus-alert-error">{{ authError }}</p>
      <button type="button" class="btn-primary w-full" @click="submitSecret">{{ t('admin.enter') }}</button>
    </div>

    <template v-else>
      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="option in (['ALL', 'OPEN', 'RESOLVED'] as const)"
          :key="option"
          type="button"
          class="neo-pill text-xs"
          :class="statusFilter === option ? 'neo-pill-active' : ''"
          @click="statusFilter = option"
        >
          {{ t(`bugReport.filter.${option.toLowerCase()}`) }}
        </button>
      </div>

      <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
        <div v-if="filteredReports.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
          {{ t('bugReport.adminEmpty') }}
        </div>
        <div v-else class="overflow-x-auto ios-card">
          <table class="w-full min-w-[720px] text-sm">
            <thead>
              <tr class="border-b border-brand-gray-100 text-start">
                <th class="p-3 font-bold">{{ t('bugReport.adminDate') }}</th>
                <th class="p-3 font-bold">{{ t('bugReport.description') }}</th>
                <th class="p-3 font-bold">{{ t('bugReport.adminReporter') }}</th>
                <th class="p-3 font-bold">{{ t('admin.status') }}</th>
                <th class="p-3 font-bold" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="report in filteredReports" :key="report.id" class="border-b border-brand-gray-50">
                <td class="p-3 tabular-nums whitespace-nowrap" dir="ltr">
                  {{ new Date(report.createdAt).toLocaleString() }}
                </td>
                <td class="max-w-xs p-3">
                  <p class="line-clamp-2">{{ report.description }}</p>
                </td>
                <td class="p-3">
                  <div v-if="report.user">{{ report.user.name }}</div>
                  <div class="text-brand-gray-600" dir="ltr">{{ report.reporterEmail || report.user?.email }}</div>
                </td>
                <td class="p-3">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-bold"
                    :class="report.status === 'OPEN' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'"
                  >
                    {{ t(`bugReport.status.${report.status.toLowerCase()}`) }}
                  </span>
                </td>
                <td class="p-3 whitespace-nowrap">
                  <button type="button" class="btn-secondary text-xs" @click="openDetail(report)">
                    {{ t('common.detail') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </AppAsyncState>
    </template>

    <AppModal :open="!!detailTarget" :title="t('bugReport.adminDetail')" max-width-class="max-w-lg" @close="closeDetail">
      <div v-if="detailTarget" class="ios-card p-4 venus-form-stack sm:p-6">
        <div>
          <p class="text-xs font-bold text-brand-gray-600">{{ t('bugReport.description') }}</p>
          <p class="mt-1 whitespace-pre-wrap text-sm">{{ detailTarget.description }}</p>
        </div>
        <div v-if="detailTarget.screenshotUrl">
          <p class="text-xs font-bold text-brand-gray-600">{{ t('bugReport.screenshot') }}</p>
          <a :href="detailTarget.screenshotUrl" target="_blank" rel="noopener noreferrer">
            <img
              :src="detailTarget.screenshotUrl"
              alt=""
              class="mt-2 max-h-64 w-full border border-brand-gray-100 object-contain"
            />
          </a>
        </div>
        <div>
          <p class="text-xs font-bold text-brand-gray-600">{{ t('bugReport.adminPage') }}</p>
          <a :href="detailTarget.pageUrl" target="_blank" rel="noopener noreferrer" class="mt-1 block break-all text-sm text-brand-primary underline" dir="ltr">
            {{ detailTarget.pageUrl }}
          </a>
        </div>
        <div v-if="detailTarget.userAgent">
          <p class="text-xs font-bold text-brand-gray-600">{{ t('bugReport.adminUserAgent') }}</p>
          <p class="mt-1 break-all text-xs text-brand-gray-600" dir="ltr">{{ detailTarget.userAgent }}</p>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn-primary flex-1"
            :disabled="updatingId === detailTarget.id"
            @click="toggleStatus(detailTarget)"
          >
            {{ detailTarget.status === 'OPEN' ? t('bugReport.markResolved') : t('bugReport.reopen') }}
          </button>
          <button type="button" class="btn-secondary flex-1" @click="closeDetail">{{ t('common.close') }}</button>
        </div>
      </div>
    </AppModal>
  </div>
</template>
