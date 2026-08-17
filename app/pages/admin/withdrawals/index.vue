<script setup lang="ts">
import {
  classifyPaymentDocumentFile,
  PAYMENT_DOCUMENT_ACCEPT,
  type PaymentDocumentRejectReason,
} from '#shared/paymentDocumentUpload.ts'

definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatCurrency, formatDate } = useFormatters()

type WithdrawStatus = 'PENDING' | 'PAID' | 'REJECTED'
type KindFilter = 'club' | 'athlete'

type PaymentDocument = {
  id: string
  url: string
  fileName: string
  contentType: string
  createdAt: string
}

type ClubWithdrawRow = {
  kind: 'club'
  id: string
  amount: number
  shebaSnapshot: string
  status: WithdrawStatus
  note: string | null
  createdAt: string
  paidAt: string | null
  rejectedAt: string | null
  paymentDocuments: PaymentDocument[]
  club: { id: string; slug: string; nameFa: string; sheba: string | null }
}

type AthleteWithdrawRow = {
  kind: 'athlete'
  id: string
  amount: number
  shebaSnapshot: string
  status: WithdrawStatus
  note: string | null
  createdAt: string
  paidAt: string | null
  rejectedAt: string | null
  paymentDocuments: PaymentDocument[]
  user: { id: string; name: string; email: string; phone: string | null; sheba: string | null }
}

type WithdrawRow = ClubWithdrawRow | AthleteWithdrawRow

const kindFilter = ref<KindFilter>('athlete')
const statusFilter = ref<'ALL' | WithdrawStatus>('PENDING')
const requests = ref<WithdrawRow[]>([])
const pending = ref(false)
const actionId = ref<string | null>(null)
const uploadId = ref<string | null>(null)
const fileInputById = ref<Record<string, HTMLInputElement | null>>({})
const loadError = ref('')
const actionError = ref('')
const actionNote = ref('')
const docError = ref('')
const acceptDocs = PAYMENT_DOCUMENT_ACCEPT

const chipBase = 'border px-3 py-1.5 text-xs font-bold transition'
const chipActive = 'border-brand-primary bg-brand-primary text-white'
const chipIdle = 'border-brand-gray-200 bg-brand-gray-50 text-brand-navy hover:border-brand-primary/40'

function statusLabel(status: WithdrawStatus) {
  return t(`admin.withdrawStatus.${status}`)
}

function statusClass(status: WithdrawStatus) {
  if (status === 'PAID') return 'bg-emerald-100 text-emerald-800'
  if (status === 'REJECTED') return 'bg-red-100 text-red-800'
  return 'bg-amber-100 text-amber-900'
}

function documentsPath(row: WithdrawRow) {
  return row.kind === 'athlete'
    ? `/api/admin/athlete-withdrawals/${row.id}/documents`
    : `/api/admin/withdrawals/${row.id}/documents`
}

function rejectDocMessage(reason: PaymentDocumentRejectReason) {
  if (reason === 'heic') return t('admin.withdrawDocsErrorHeic')
  if (reason === 'type') return t('admin.withdrawDocsErrorType')
  if (reason === 'size') return t('admin.withdrawDocsErrorSize')
  return t('admin.withdrawDocsErrorEmpty')
}

function setFileInput(id: string, el: unknown) {
  fileInputById.value[id] = (el as HTMLInputElement | null) || null
}

function pickDocuments(row: WithdrawRow) {
  fileInputById.value[row.id]?.click()
}

async function onDocumentsSelected(row: WithdrawRow, event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files || [])]
  input.value = ''
  if (!files.length || !secret.value || uploadId.value) return
  uploadId.value = row.id
  docError.value = ''
  try {
    for (const file of files) {
      const reason = classifyPaymentDocumentFile(file)
      if (reason) {
        docError.value = rejectDocMessage(reason)
        return
      }
      const form = new FormData()
      form.append('file', file)
      const data = await adminFetch<{ document: PaymentDocument }>(documentsPath(row), {
        method: 'POST',
        body: form,
      })
      row.paymentDocuments = [data.document, ...(row.paymentDocuments || [])]
    }
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      docError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      docError.value = t('common.error')
    }
  } finally {
    uploadId.value = null
  }
}

async function removeDocument(row: WithdrawRow, doc: PaymentDocument) {
  if (!secret.value || uploadId.value) return
  uploadId.value = row.id
  docError.value = ''
  try {
    await adminFetch(`${documentsPath(row)}/${doc.id}`, { method: 'DELETE' })
    row.paymentDocuments = (row.paymentDocuments || []).filter((item) => item.id !== doc.id)
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      docError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      docError.value = t('common.error')
    }
  } finally {
    uploadId.value = null
  }
}

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  actionError.value = ''
  docError.value = ''
  try {
    const params = new URLSearchParams({ status: statusFilter.value })
    if (kindFilter.value === 'athlete') {
      const data = await adminFetch<{ requests: Omit<AthleteWithdrawRow, 'kind'>[] }>(
        `/api/admin/athlete-withdrawals?${params}`,
      )
      requests.value = data.requests.map((row) => ({
        ...row,
        kind: 'athlete' as const,
        paymentDocuments: row.paymentDocuments || [],
      }))
    } else {
      const data = await adminFetch<{ requests: Omit<ClubWithdrawRow, 'kind'>[] }>(
        `/api/admin/withdrawals?${params}`,
      )
      requests.value = data.requests.map((row) => ({
        ...row,
        kind: 'club' as const,
        paymentDocuments: row.paymentDocuments || [],
      }))
    }
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

async function act(row: WithdrawRow, action: 'paid' | 'reject') {
  if (!secret.value || actionId.value) return
  actionId.value = row.id
  actionError.value = ''
  try {
    const path = row.kind === 'athlete'
      ? `/api/admin/athlete-withdrawals/${row.id}`
      : `/api/admin/withdrawals/${row.id}`
    await adminFetch(path, {
      method: 'POST',
      body: {
        action,
        note: actionNote.value.trim() || undefined,
      },
    })
    actionNote.value = ''
    await load()
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      actionError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      actionError.value = t('common.error')
    }
  } finally {
    actionId.value = null
  }
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })

watch([statusFilter, kindFilter], () => {
  if (secret.value) load()
})
</script>

<template>
  <div class="tail-page-stack">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="tail-page-title">{{ t('admin.withdrawalsTitle') }}</h1>
        <p class="text-sm text-brand-gray-600">{{ t('admin.withdrawalsSubtitle') }}</p>
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

    <p class="text-sm text-brand-gray-600 text-start">{{ t('admin.withdrawalsManualNote') }}</p>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="option in (['athlete', 'club'] as const)"
        :key="option"
        type="button"
        :class="[chipBase, kindFilter === option ? chipActive : chipIdle]"
        style="border-radius: 2px;"
        @click="kindFilter = option"
      >
        {{ option === 'athlete' ? t('admin.withdrawalsKindAthlete') : t('admin.withdrawalsKindClub') }}
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="option in (['PENDING', 'PAID', 'REJECTED', 'ALL'] as const)"
        :key="option"
        type="button"
        :class="[chipBase, statusFilter === option ? chipActive : chipIdle]"
        style="border-radius: 2px;"
        @click="statusFilter = option"
      >
        {{ option === 'ALL' ? t('common.all') : statusLabel(option) }}
      </button>
    </div>

    <AppFormField :label="t('admin.withdrawNoteLabel')" class="max-w-md">
      <input
        v-model="actionNote"
        type="text"
        class="neo-input"
        style="border-radius: 2px;"
        :placeholder="t('admin.withdrawNotePlaceholder')"
      />
    </AppFormField>

    <p class="text-xs text-brand-gray-600 text-start">{{ t('admin.withdrawDocsHint') }}</p>
    <p v-if="actionError" class="venus-alert-error text-start" role="alert">{{ actionError }}</p>
    <p v-if="docError" class="venus-alert-error text-start" role="alert">{{ docError }}</p>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
      <div v-if="requests.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
        {{ t('common.empty') }}
      </div>
      <div v-else class="overflow-x-auto ios-card">
        <table class="w-full min-w-[1040px] text-sm">
          <thead>
            <tr class="border-b border-brand-gray-100 text-start">
              <th class="p-3 font-bold">{{ t('common.date') }}</th>
              <th class="p-3 font-bold">
                {{ kindFilter === 'athlete' ? t('admin.userName') : t('admin.clubName') }}
              </th>
              <th class="p-3 font-bold">{{ t('admin.amount') }}</th>
              <th class="p-3 font-bold">{{ t('admin.withdrawSheba') }}</th>
              <th class="p-3 font-bold">{{ t('admin.status') }}</th>
              <th class="p-3 font-bold">{{ t('admin.withdrawDocsLabel') }}</th>
              <th class="p-3 font-bold" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in requests" :key="`${row.kind}-${row.id}`" class="border-b border-brand-gray-50">
              <td class="p-3 tabular-nums whitespace-nowrap" dir="ltr">
                {{ formatDate(row.createdAt) }}
              </td>
              <td class="p-3">
                <template v-if="row.kind === 'club'">
                  <NuxtLink
                    :to="localePath(`/admin/clubs/${row.club.id}`)"
                    class="font-bold text-brand-navy underline"
                  >
                    {{ row.club.nameFa }}
                  </NuxtLink>
                  <div class="text-xs text-brand-gray-600" dir="ltr">{{ row.club.slug }}</div>
                </template>
                <template v-else>
                  <span class="font-bold text-brand-navy">{{ row.user.name }}</span>
                  <div class="text-xs text-brand-gray-600" dir="ltr">{{ row.user.phone || row.user.email }}</div>
                </template>
              </td>
              <td class="p-3 tabular-nums" dir="ltr">{{ formatCurrency(row.amount) }}</td>
              <td class="p-3 font-mono text-xs" dir="ltr">{{ row.shebaSnapshot }}</td>
              <td class="p-3">
                <span
                  class="px-2 py-0.5 text-xs font-bold"
                  style="border-radius: 2px;"
                  :class="statusClass(row.status)"
                >
                  {{ statusLabel(row.status) }}
                </span>
                <div v-if="row.note" class="mt-1 text-xs text-brand-gray-600">{{ row.note }}</div>
              </td>
              <td class="p-3 align-top">
                <div class="flex min-w-[220px] flex-col gap-2 text-start">
                  <p v-if="!(row.paymentDocuments || []).length" class="text-xs text-brand-gray-500">
                    {{ t('admin.withdrawDocsEmpty') }}
                  </p>
                  <ul v-else class="space-y-1">
                    <li
                      v-for="doc in row.paymentDocuments"
                      :key="doc.id"
                      class="flex items-center justify-between gap-2"
                    >
                      <a
                        :href="doc.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="truncate text-xs font-bold text-brand-navy underline"
                        :title="doc.fileName"
                      >
                        {{ doc.fileName }}
                      </a>
                      <button
                        type="button"
                        class="shrink-0 text-xs font-bold text-brand-primary disabled:opacity-60"
                        :disabled="uploadId === row.id"
                        @click="removeDocument(row, doc)"
                      >
                        {{ t('admin.withdrawDocsRemove') }}
                      </button>
                    </li>
                  </ul>
                  <input
                    :ref="(el) => setFileInput(row.id, el)"
                    type="file"
                    class="hidden"
                    :accept="acceptDocs"
                    multiple
                    @change="onDocumentsSelected(row, $event)"
                  />
                  <button
                    type="button"
                    class="border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40 disabled:opacity-60"
                    style="border-radius: 2px;"
                    :disabled="uploadId === row.id"
                    @click="pickDocuments(row)"
                  >
                    {{ uploadId === row.id ? t('admin.withdrawDocsUploading') : t('admin.withdrawDocsUpload') }}
                  </button>
                </div>
              </td>
              <td class="p-3 whitespace-nowrap">
                <div v-if="row.status === 'PENDING'" class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                    style="border-radius: 2px;"
                    :disabled="actionId === row.id"
                    @click="act(row, 'paid')"
                  >
                    {{ t('admin.withdrawMarkPaid') }}
                  </button>
                  <button
                    type="button"
                    class="border border-brand-primary bg-white px-3 py-1.5 text-xs font-bold text-brand-primary transition hover:bg-brand-primary/5 disabled:opacity-60"
                    style="border-radius: 2px;"
                    :disabled="actionId === row.id"
                    @click="act(row, 'reject')"
                  >
                    {{ t('admin.withdrawReject') }}
                  </button>
                </div>
                <span v-else class="text-xs text-brand-gray-500">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppAsyncState>
  </div>
</template>
