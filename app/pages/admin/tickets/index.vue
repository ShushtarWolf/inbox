<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatDate, formatPhone } = useFormatters()

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
type TicketSource = 'CONTACT' | 'ATHLETE' | 'OWNER'

type TicketRow = {
  id: string
  status: TicketStatus
  source: TicketSource
  body: string
  name: string | null
  email: string | null
  phone: string | null
  pageUrl: string | null
  bookingId: string | null
  createdAt: string
  resolvedAt: string | null
  user: { id: string; email: string; name: string; role: string; phone: string | null } | null
  club: { id: string; slug: string; nameFa: string } | null
  messages: { id: string; body: string; fromAdmin: boolean; createdAt: string }[]
}

const statusFilter = ref<'ALL' | TicketStatus>('OPEN')
const tickets = ref<TicketRow[]>([])
const pending = ref(false)
const loadError = ref('')
const actionError = ref('')
const search = ref('')
const expandedId = ref<string | null>(null)
const replyDraft = ref('')
const actionId = ref<string | null>(null)

const chipBase = 'border px-3 py-1.5 text-xs font-bold transition'
const chipActive = 'border-brand-primary bg-brand-primary text-white'
const chipIdle = 'border-brand-gray-200 bg-brand-gray-50 text-brand-navy hover:border-brand-primary/40'

function statusLabel(status: TicketStatus) {
  return t(`admin.ticketStatus.${status}`)
}

function sourceLabel(source: TicketSource) {
  return t(`admin.ticketSource.${source}`)
}

function statusClass(status: TicketStatus) {
  if (status === 'RESOLVED') return 'bg-emerald-100 text-emerald-800'
  if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-800'
  return 'bg-amber-100 text-amber-900'
}

function preview(body: string) {
  const compact = body.replace(/\s+/g, ' ').trim()
  return compact.length > 80 ? `${compact.slice(0, 80)}…` : compact
}

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  actionError.value = ''
  try {
    const params = new URLSearchParams({ status: statusFilter.value })
    if (search.value.trim()) params.set('q', search.value.trim())
    const data = await adminFetch<{ tickets: TicketRow[] }>(`/api/admin/tickets?${params}`)
    tickets.value = data.tickets
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

async function setStatus(row: TicketRow, status: TicketStatus) {
  if (!secret.value || actionId.value) return
  actionId.value = row.id
  actionError.value = ''
  try {
    await adminFetch(`/api/admin/tickets/${row.id}`, {
      method: 'POST',
      body: { action: 'status', status },
    })
    await load()
  } catch {
    actionError.value = t('common.error')
  } finally {
    actionId.value = null
  }
}

async function reply(row: TicketRow) {
  if (!secret.value || actionId.value) return
  actionId.value = row.id
  actionError.value = ''
  try {
    await adminFetch(`/api/admin/tickets/${row.id}`, {
      method: 'POST',
      body: { action: 'reply', note: replyDraft.value },
    })
    replyDraft.value = ''
    await load()
  } catch {
    actionError.value = t('common.error')
  } finally {
    actionId.value = null
  }
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })

watch(statusFilter, () => {
  if (secret.value) load()
})
</script>

<template>
  <div class="tail-page-stack">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="tail-page-title">{{ t('admin.ticketsTitle') }}</h1>
        <p class="text-sm text-brand-gray-600">{{ t('admin.ticketsSubtitle') }}</p>
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

    <div class="flex flex-wrap gap-2">
      <button
        v-for="option in (['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ALL'] as const)"
        :key="option"
        type="button"
        :class="[chipBase, statusFilter === option ? chipActive : chipIdle]"
        style="border-radius: 2px;"
        @click="statusFilter = option"
      >
        {{ option === 'ALL' ? t('common.all') : statusLabel(option) }}
      </button>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <AppFormField :label="t('admin.searchTickets')" class="min-w-[12rem] flex-1">
        <input
          v-model="search"
          type="search"
          class="neo-input"
          style="border-radius: 2px;"
          :placeholder="t('admin.searchTicketsPlaceholder')"
          @keyup.enter="load"
        >
      </AppFormField>
      <button
        type="button"
        class="border border-brand-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-brand-navy transition hover:border-brand-primary/40"
        style="border-radius: 2px;"
        @click="load"
      >
        {{ t('admin.search') }}
      </button>
    </div>

    <p v-if="actionError" class="venus-alert-error text-start" role="alert">{{ actionError }}</p>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
      <div v-if="tickets.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
        {{ t('common.empty') }}
      </div>
      <div v-else class="overflow-x-auto ios-card">
        <table class="w-full min-w-[860px] text-sm">
          <thead>
            <tr class="border-b border-brand-gray-100 text-start">
              <th class="p-3 font-bold">{{ t('common.date') }}</th>
              <th class="p-3 font-bold">{{ t('admin.ticketFrom') }}</th>
              <th class="p-3 font-bold">{{ t('admin.ticketPreview') }}</th>
              <th class="p-3 font-bold">{{ t('admin.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in tickets" :key="row.id">
              <tr class="border-b border-brand-gray-50 cursor-pointer" @click="expandedId = expandedId === row.id ? null : row.id">
                <td class="p-3 tabular-nums whitespace-nowrap" dir="ltr">{{ formatDate(row.createdAt) }}</td>
                <td class="p-3">
                  <div class="font-bold">{{ row.name || row.user?.name || '—' }}</div>
                  <div class="text-xs text-brand-gray-600">{{ sourceLabel(row.source) }}</div>
                  <div v-if="row.email || row.user?.email" class="text-xs" dir="ltr">{{ row.email || row.user?.email }}</div>
                </td>
                <td class="p-3 text-start">{{ preview(row.body) }}</td>
                <td class="p-3">
                  <span class="px-2 py-0.5 text-xs font-bold" style="border-radius: 2px;" :class="statusClass(row.status)">
                    {{ statusLabel(row.status) }}
                  </span>
                </td>
              </tr>
              <tr v-if="expandedId === row.id">
                <td colspan="4" class="bg-brand-gray-50 p-4 text-start">
                  <div class="space-y-3">
                    <p v-if="row.phone || row.user?.phone" class="text-xs" dir="ltr">{{ formatPhone(row.phone || row.user?.phone) }}</p>
                    <p v-if="row.bookingId" class="text-xs" dir="ltr">{{ t('admin.ticketBookingId') }}: {{ row.bookingId }}</p>
                    <NuxtLink
                      v-if="row.club"
                      :to="localePath(`/admin/clubs/${row.club.id}`)"
                      class="text-xs font-bold underline"
                    >
                      {{ row.club.nameFa }}
                    </NuxtLink>
                    <div
                      v-for="msg in row.messages"
                      :key="msg.id"
                      class="border border-brand-gray-200 bg-white p-3 text-sm"
                      style="border-radius: 2px;"
                    >
                      <p class="text-xs font-bold text-brand-gray-500">
                        {{ msg.fromAdmin ? t('admin.ticketAdminReply') : t('admin.ticketCustomer') }}
                        · <span dir="ltr">{{ formatDate(msg.createdAt) }}</span>
                      </p>
                      <p class="mt-1 whitespace-pre-wrap">{{ msg.body }}</p>
                    </div>
                    <AppFormField :label="t('admin.ticketReplyLabel')">
                      <textarea
                        v-model="replyDraft"
                        class="neo-input"
                        style="border-radius: 2px;"
                        rows="3"
                        :placeholder="t('admin.ticketReplyPlaceholder')"
                      />
                    </AppFormField>
                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="bg-brand-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                        style="border-radius: 2px;"
                        :disabled="actionId === row.id || !replyDraft.trim()"
                        @click="reply(row)"
                      >
                        {{ t('admin.ticketSendReply') }}
                      </button>
                      <button
                        v-if="row.status !== 'IN_PROGRESS'"
                        type="button"
                        class="border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-60"
                        style="border-radius: 2px;"
                        :disabled="actionId === row.id"
                        @click="setStatus(row, 'IN_PROGRESS')"
                      >
                        {{ t('admin.ticketMarkProgress') }}
                      </button>
                      <button
                        v-if="row.status !== 'RESOLVED'"
                        type="button"
                        class="border border-emerald-600 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 disabled:opacity-60"
                        style="border-radius: 2px;"
                        :disabled="actionId === row.id"
                        @click="setStatus(row, 'RESOLVED')"
                      >
                        {{ t('admin.ticketMarkResolved') }}
                      </button>
                      <button
                        v-if="row.status === 'RESOLVED'"
                        type="button"
                        class="border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-60"
                        style="border-radius: 2px;"
                        :disabled="actionId === row.id"
                        @click="setStatus(row, 'OPEN')"
                      >
                        {{ t('admin.ticketReopen') }}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </AppAsyncState>
  </div>
</template>
