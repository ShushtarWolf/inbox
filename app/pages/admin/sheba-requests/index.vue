<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatDate, formatPhone } = useFormatters()

type ShebaStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

type ShebaRow = {
  id: string
  subject: 'CLUB' | 'USER'
  proposedSheba: string | null
  previousSheba: string | null
  status: ShebaStatus
  adminNote: string | null
  createdAt: string
  reviewedAt: string | null
  club: { id: string; slug: string; nameFa: string; sheba: string | null } | null
  user: { id: string; name: string; email: string; phone: string | null; sheba: string | null } | null
}

const statusFilter = ref<'ALL' | ShebaStatus>('PENDING')
const requests = ref<ShebaRow[]>([])
const pending = ref(false)
const actionId = ref<string | null>(null)
const loadError = ref('')
const actionError = ref('')
const actionNote = ref('')

const chipBase = 'border px-3 py-1.5 text-xs font-bold transition'
const chipActive = 'border-brand-primary bg-brand-primary text-white'
const chipIdle = 'border-brand-gray-200 bg-brand-gray-50 text-brand-navy hover:border-brand-primary/40'

function subjectLabel(row: ShebaRow) {
  return row.subject === 'CLUB' ? t('admin.shebaQueue.subjectClub') : t('admin.shebaQueue.subjectUser')
}

function displaySheba(value: string | null) {
  return value || '—'
}

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    const data = await adminFetch<{ requests: ShebaRow[] }>(
      `/api/admin/sheba-requests?status=${statusFilter.value}`,
    )
    requests.value = data.requests
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

async function act(row: ShebaRow, action: 'approve' | 'reject') {
  actionId.value = row.id
  actionError.value = ''
  try {
    await adminFetch(`/api/admin/sheba-requests/${row.id}`, {
      method: 'POST',
      body: { action, note: actionNote.value || undefined },
    })
    actionNote.value = ''
    await load()
  } catch {
    actionError.value = t('common.error')
  } finally {
    actionId.value = null
  }
}

watch([secret, statusFilter], () => {
  if (secret.value) load()
}, { immediate: true })
</script>

<template>
  <div class="tail-page-stack">
    <section class="admin-overview-hero">
      <h1 class="text-2xl font-bold text-white">{{ t('admin.shebaQueue.title') }}</h1>
      <p class="mt-1 text-sm text-white/85">{{ t('admin.shebaQueue.subtitle') }}</p>
    </section>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="opt in (['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const)"
        :key="opt"
        type="button"
        :class="[chipBase, statusFilter === opt ? chipActive : chipIdle]"
        style="border-radius: 0;"
        @click="statusFilter = opt"
      >
        {{ opt === 'ALL' ? t('common.all') : t(`admin.shebaQueue.status.${opt}`) }}
      </button>
    </div>

    <p v-if="loadError" class="venus-alert-error">{{ loadError }}</p>
    <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>

    <AppAsyncState :pending="pending" :error="null" skeleton-variant="table">
      <div class="overflow-x-auto border border-brand-gray-200 bg-white" style="border-radius: 0;">
        <table class="w-full min-w-[720px] text-start text-sm">
          <thead class="border-b border-brand-gray-200 bg-brand-gray-50 text-xs">
            <tr>
              <th class="p-3 font-bold">{{ t('admin.shebaQueue.colSubject') }}</th>
              <th class="p-3 font-bold">{{ t('admin.shebaQueue.colParty') }}</th>
              <th class="p-3 font-bold">{{ t('admin.shebaQueue.colPrevious') }}</th>
              <th class="p-3 font-bold">{{ t('admin.shebaQueue.colProposed') }}</th>
              <th class="p-3 font-bold">{{ t('admin.createdAt') }}</th>
              <th class="p-3 font-bold">{{ t('admin.shebaQueue.colActions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in requests" :key="row.id" class="border-b border-brand-gray-100 align-top">
              <td class="p-3">{{ subjectLabel(row) }}</td>
              <td class="p-3">
                <NuxtLink
                  v-if="row.club"
                  :to="localePath(`/admin/clubs/${row.club.id}`)"
                  class="admin-alink font-bold"
                >
                  {{ row.club.nameFa }}
                </NuxtLink>
                <template v-else-if="row.user">
                  <div class="font-bold">{{ row.user.name }}</div>
                  <div class="text-xs text-brand-gray-600" dir="ltr">{{ row.user.email }}</div>
                  <div v-if="row.user.phone" class="text-xs" dir="ltr">{{ formatPhone(row.user.phone) }}</div>
                </template>
              </td>
              <td class="p-3 font-mono text-xs" dir="ltr">{{ displaySheba(row.previousSheba) }}</td>
              <td class="p-3 font-mono text-xs" dir="ltr">{{ displaySheba(row.proposedSheba) }}</td>
              <td class="p-3 text-xs">{{ formatDate(row.createdAt) }}</td>
              <td class="p-3">
                <div v-if="row.status === 'PENDING'" class="flex flex-col gap-2">
                  <textarea
                    v-model="actionNote"
                    class="neo-input min-h-[52px] text-xs"
                    style="border-radius: 0;"
                    :placeholder="t('admin.shebaQueue.notePlaceholder')"
                  />
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="bg-brand-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      style="border-radius: 0;"
                      :disabled="actionId === row.id"
                      @click="act(row, 'approve')"
                    >
                      {{ t('admin.shebaQueue.approve') }}
                    </button>
                    <button
                      type="button"
                      class="border border-brand-gray-300 px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                      style="border-radius: 0;"
                      :disabled="actionId === row.id"
                      @click="act(row, 'reject')"
                    >
                      {{ t('admin.shebaQueue.reject') }}
                    </button>
                  </div>
                </div>
                <p v-else-if="row.adminNote" class="text-xs text-brand-gray-600">{{ row.adminNote }}</p>
                <span v-else class="text-xs text-brand-gray-400">—</span>
              </td>
            </tr>
            <tr v-if="!requests.length">
              <td colspan="6" class="p-6 text-center text-sm text-brand-gray-500">{{ t('admin.shebaQueue.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppAsyncState>
  </div>
</template>

<style scoped>
.admin-overview-hero {
  @apply relative mb-6 overflow-hidden p-[22px] text-white min-[431px]:px-7;
  border-radius: 0;
  background: linear-gradient(135deg, #c41e1e, #b01818);
}
</style>
